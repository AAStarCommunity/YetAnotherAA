# Social Recovery 端到端验证方案

> 目标：验证 AirAccount 社交恢复完整流程
> 网络：Sepolia
> 日期：2026-03-31

---

## 前置准备

### 1. 环境配置

确认 `YetAnotherAA/aastar/.env` 中以下配置正确：

```
ETH_PRIVATE_KEY=0x1b9c251d318c3c8576b96beddfdc4ec2ffbff762d70325787bde31559db83a21
CHAIN_ID=11155111
ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

> `ETH_PRIVATE_KEY` 对应 `aastar-sdk/.env.sepolia` 中的 `TEST_PRIVATE_KEY`，用于后端 relayer 发送链上 `executeRecovery()` 交易。

### 2. 启动服务

```bash
# 后端（端口 3001）
cd YetAnotherAA/aastar
npm run start:dev

# 前端
cd YetAnotherAA/aastar-frontend
npm run dev
```

### 3. 准备 MetaMask 账户

准备 3 个不同的 MetaMask 账户，记录地址：

| 角色 | 变量名 | 说明 |
|------|--------|------|
| 主账户 | `ADDR_A` | 账户 A 的 owner，也是恢复后账户 B 的新 owner |
| Guardian 1 | `ADDR_G1` | MetaMask 账户 2 |
| Guardian 2 | `ADDR_G2` | MetaMask 账户 3 |

---

## 第一阶段：账户 A 充值与转账

### 步骤 1.1：注册用户 A

页面：`http://localhost:3000/auth/register`

- 邮箱：`usera@test.com`
- 注册成功后重定向到 Dashboard

### 步骤 1.2：创建账户 A（无 guardian）

Dashboard → 点击 **Create Account** → 选择 EntryPoint v0.7 → 点击 Create Account

**预期结果**：页面显示 `SMART_ACCOUNT_A` 地址

### 步骤 1.3：充值

向 `SMART_ACCOUNT_A` 发送至少 **0.01 Sepolia ETH**

获取测试 ETH：
- https://sepoliafaucet.com
- https://www.alchemy.com/faucets/ethereum-sepolia

**验证**：Dashboard 余额显示 > 0

### 步骤 1.4：执行转账

页面：`http://localhost:3000/transfer`

- 收款地址：任意 Sepolia 地址（或 `ADDR_A`）
- 金额：`0.001`
- 勾选 Use Paymaster
- 点击 Send → 完成 passkey 认证

**预期结果**：转账成功，Dashboard 显示转账记录，余额减少

---

## 第二阶段：创建账户 B（带 2 个 Guardian）

### 步骤 2.1：注册 Guardian 用户

Guardian 必须是系统注册用户，且用户的 `walletAddress` 必须与 guardian 地址一致。

**注册 Guardian 1**：
1. 浏览器新标签页访问 `/auth/register`，邮箱 `guardian1@test.com`
2. 注册成功后，通过 Swagger（`http://localhost:3001/api/v1/docs`）或直接调用：

```
POST /auth/wallet/link
Authorization: Bearer <JWT_G1>
Body: { "kmsKeyId": "<KMS生成的keyId>", "address": "ADDR_G1" }
```

**注册 Guardian 2**：同上，邮箱 `guardian2@test.com`，地址 `ADDR_G2`

**验证**：
```
GET /auth/profile
Authorization: Bearer <JWT_G1>
```
预期：`{ walletAddress: "ADDR_G1" }`

### 步骤 2.2：创建账户 B（带 guardian）

以 `userb@test.com` 注册并登录，Dashboard → **Create Account**

**Step 1 - Config**：
- EntryPoint：v0.7
- 展开 Advanced Options → Daily Limit 填 `0.5`
- 点击 Create Account → 进入 guardian 签名步骤

**Step 2 - Guardian 1 签名**：
- 复制页面下方的 guardian-sign URL，在新标签页打开
- 选择 **MetaMask** 签名方式
- MetaMask 切换到 `ADDR_G1` 账户
- 点击 Sign with MetaMask → 确认弹窗
- 复制返回的 Address 和 Signature，粘贴回 CreateAccount 对话框
- 点击 **Next: Guardian 2**

**Step 3 - Guardian 2 签名**：
- 同上，MetaMask 切换到 `ADDR_G2` 账户
- 复制签名粘贴回对话框
- 点击 **Create Account**

**预期结果**：账户 `SMART_ACCOUNT_B` 创建成功，链上配置：
- `guardian0 = ADDR_G1`
- `guardian1 = ADDR_G2`
- `guardian2 = 默认社区 Safe 地址`

---

## 第三阶段：对账户 B 执行社交恢复

目标：将 `SMART_ACCOUNT_B` 的 owner 从 `ADDR_B` 恢复为 `ADDR_A`

### 步骤 3.1：注册 Guardian 关系（以账户 B 的 JWT 登录）

页面：`http://localhost:3000/recovery`

填写表单：
- Account Address：`SMART_ACCOUNT_B`
- New Signer Address：`ADDR_A`
- Guardian 1 Address：`ADDR_G1`
- Guardian 2 Address：`ADDR_G2`

点击 **Register Guardians & Continue**

**预期结果**：两个 guardian 地址写入数据库，进入 Initiate 步骤

### 步骤 3.2：链上 proposeRecovery（Guardian 1 操作）

**必须在链上调用**，后端 relayer 无法代替 guardian 调用此函数（合约要求 `msg.sender == guardian`）。

使用 Remix IDE（https://remix.ethereum.org）：
1. 新建文件，粘贴 ABI：
```json
[{"inputs":[{"type":"address","name":"_newOwner"}],"name":"proposeRecovery","outputs":[],"stateMutability":"nonpayable","type":"function"}]
```
2. Deploy & Run → Environment 选 Injected Provider（MetaMask）
3. MetaMask 切换到 `ADDR_G1`，网络切换到 Sepolia
4. At Address 填入 `SMART_ACCOUNT_B` → Load
5. 调用 `proposeRecovery`，参数填 `ADDR_A`
6. 确认 MetaMask 交易，等待上链

### 步骤 3.3：Guardian 1 发起恢复（后端记录）

**切换登录为 guardian1@test.com**（Guardian 1 的 JWT）

Recovery 页面 → Step 2 → 点击 **Initiate Recovery (as Guardian 1)**

**预期结果**：
```json
{
  "status": "pending",
  "supporters": ["ADDR_G1"],
  "supportCount": 1,
  "executeAfter": "<timestamp_48h后>",
  "quorumRequired": 2
}
```

### 步骤 3.4：链上 approveRecovery（Guardian 2 操作）

使用 Remix，切换 MetaMask 到 `ADDR_G2`，调用：
```json
[{"inputs":[],"name":"approveRecovery","outputs":[],"stateMutability":"nonpayable","type":"function"}]
```
`SMART_ACCOUNT_B.approveRecovery()`，确认交易

### 步骤 3.5：Guardian 2 支持恢复（后端记录）

**切换登录为 guardian2@test.com**（Guardian 2 的 JWT）

Recovery 页面 → Step 3 → 点击 **Support Recovery (as Guardian 2)**

**预期结果**：
```json
{
  "supportCount": 2,
  "quorumReached": true
}
```

### 步骤 3.6：等待 48 小时

`executeAfter` 时间戳过后，Recovery 页面 Step 4 的时间锁状态会显示 **"Expired — ready"**。

> 注意：链上也有 2 天 timelock（`proposedAt + 2 days`），需同步等待。

### 步骤 3.7：执行恢复

Recovery 页面 → Step 4 → 点击 **Execute Recovery**

后端 relayer（`ETH_PRIVATE_KEY`）发送链上 `executeRecovery()` 交易。

**预期结果**：
```json
{
  "message": "Account recovery executed successfully (on-chain + database updated)",
  "newSignerAddress": "ADDR_A",
  "txHash": "0x..."
}
```

---

## 第四阶段：验证恢复结果

| 验证项 | 方法 | 预期结果 |
|--------|------|----------|
| 链上 owner 已更新 | Remix `SMART_ACCOUNT_B.owner()` 或 Etherscan | `ADDR_A` |
| 数据库 signerAddress | `GET /account`（JWT_B） | `ADDR_A` |
| activeRecovery 已清除 | `GET /guardian/recovery/SMART_ACCOUNT_B` | `null` 或 `onChain.active: false` |
| 账户 B 余额未变 | `GET /account/balance`（JWT_B） | 与恢复前相同 |
| 账户 A 转账记录 | Dashboard（JWT_A） | 第一阶段的记录仍存在 |

---

## 流程总览

```
[用户A注册] → [创建账户A] → [充值] → [转账] → [验证记录]
                                                      ↓
[注册G1/G2用户] → [创建账户B with guardian] → [SMART_ACCOUNT_B]
                                                      ↓
[Recovery页面填写地址] → [注册guardian关系]
                                ↓
[Remix] ADDR_G1 调 proposeRecovery(ADDR_A)
[后端] Guardian1 initiateRecovery
[Remix] ADDR_G2 调 approveRecovery()
[后端] Guardian2 supportRecovery
                                ↓
            [等待 48小时 + 链上 2天 timelock]
                                ↓
[Recovery页面] executeRecovery → relayer 发链上交易
                                ↓
[验证] owner == ADDR_A ✓  余额不变 ✓  记录存在 ✓
```

---

## 关键约束

- `proposeRecovery` / `approveRecovery` 必须 guardian 自己调（`msg.sender == guardian`），后端无法代替
- `initiateRecovery` / `supportRecovery` 需要 guardian 用自己的账户登录系统
- `executeRecovery` 无调用者限制，后端 relayer 代发
- 链上 + 后端双重 48h/2day timelock，两者都需满足

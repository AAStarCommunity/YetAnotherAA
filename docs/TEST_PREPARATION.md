# 测试准备（Test Preparation）

> 配套 `TEST_PLAN.md`。**测试前必须先把准备做齐**：环境变量、服务、测试账户、测试 token、API key。
> 用 `node scripts/test/check-prereqs.mjs` 自动体检——**未全绿不开始测试**。本文档说明每项需要什么、配在哪、怎么检查、缺了怎么补。

---

## 0. 配置放哪

| 文件 | 用途 | 是否提交 |
|---|---|---|
| `aastar/.env` | 后端运行配置（已存在，gitignore） | 否 |
| `aastar/.env.example` | 后端变量清单参考 | 是 |
| `scripts/test/.env.test` | **测试专用**：测试 EOA 私钥、测试钱包、OTP 测试通道等 | **否（gitignore）** |
| `scripts/test/.env.test.example` | 测试变量清单参考 | 是 |

> 检查脚本会同时读 `aastar/.env` + `scripts/test/.env.test` + 进程环境。

---

## 1. 服务（跑测前必须在线）

| 服务 | 怎么起 / 怎么查 | 谁用 |
|---|---|---|
| 后端 :3000 | `cd aastar && KMS_DIAG=true npm run start:dev`；查 `curl :3000/api-docs`=200 | L2/L3、所有经后端的写 |
| 前端 :5173 | `npm run dev -w aastar-frontend`；查 `:5173/tokens`=200 | L3 |
| ETH RPC | `aastar/.env` `ETH_RPC_URL`；查 `eth_chainId`==11155111 | 全部链上 |
| Bundler | `BUNDLER_RPC_URL`（Pimlico）；查 `eth_supportedEntryPoints` | UserOp 提交（转账/Guard 写） |
| KMS | `KMS_ENDPOINT`（kms.aastar.io）+ `KMS_API_KEY`；查 `/version` | 登录/转账/Guard 写（设备 passkey ceremony） |
| DVT relay | SDK `getDvtRelayerUrlsForChain` → dvt1/2/3.aastar.io；`checkDvtConnectivity` 全 ok | gasless 买入 |

---

## 2. 后端必需环境变量（缺则后端启动失败 / 流程不通）

| 变量 | 必需 | 校验点 | 缺了怎样 |
|---|---|---|---|
| `JWT_SECRET` | ✅ | 非空 | 启动失败 |
| `USER_ENCRYPTION_KEY` | ✅ | **正好 32 字符** | 启动失败 |
| `ETH_RPC_URL` | ✅ | 可连 + chainId 对 | 启动失败 / 链读失败 |
| `BUNDLER_RPC_URL` | ✅ | 可连 | UserOp 提交失败 |
| `CHAIN_ID` | ✅ | =11155111（测试网） | 地址/链不一致 |
| `DB_TYPE` | ✅ | `json`（本地） | — |
| `KMS_ENABLED` | 登录/写需 | `true` | passkey 流不可用 |
| `KMS_ENDPOINT` | KMS 开时 | 可连 | KMS 调用失败 |
| `KMS_API_KEY` | KMS 开时 | 非空 + 401 测试 | KMS 401 |
| `RESEND_API_KEY` / `EMAIL_FROM` | OTP 邮件 | 非空 | 收不到 OTP（除非测试通道） |
| 合约地址组 | 从 SDK 取优先 | 见 §5 | 用旧 .env 地址会指错（参考历史 0x1f0D 事故） |

> 地址优先级：**SDK canonical > .env**。用例断言地址以 `@aastar/sdk` 为准。

---

## 3. 测试专用变量（`scripts/test/.env.test`）

| 变量 | 用途 | 怎么准备 |
|---|---|---|
| `TEST_EOA_PRIVATE_KEY` | **L1 链上脚本主账户**（买币/转账/Guard/质押） | 一个 Sepolia EOA 私钥，按 §4 注资 |
| `TEST_EOA_PRIVATE_KEY_2` | 第二钱包（guardian / 收款人 / 社区成员） | 可选，同上 |
| `TEST_AIR_ACCOUNT` | 已部署、**带 Guard**（dailyLimit>0）的 AirAccount 地址 | 用 D1 流程创建并部署；Guard 写用例需要 |
| `TEST_COMMUNITY_ADDRESS` | 已注册社区（社区用例查询/加入用） | 用 D6 创建，或用官方 AAStar/Mycelium |
| `TEST_TOKEN_USDC` / `_USDT` | 覆盖默认（一般不用，SDK 提供） | 留空走 SDK |
| `OTP_TEST_MODE` | 后端测试模式可读 OTP（L3 注册自动化） | 需后端支持（见 §6 待办） |
| `MAINNET_ENABLED` | 是否允许主网用例 | 默认 false（栈未就绪） |

---

## 4. 测试账户与 Token 余额（L1/链上用例的硬前置）

`TEST_EOA_PRIVATE_KEY` 对应的 Sepolia EOA 需要：

| 资产 | 用途 | 最低建议 | 怎么补 |
|---|---|---|---|
| **Sepolia ETH** | self-pay 买入/转账 gas、部署 | ≥ 0.05 | 公共水龙头 |
| **USDC** | gasless 买入（EIP-3009）+ self-pay 买入 | ≥ 10 | 测试网 USDC 水龙头 / 转入 |
| **USDT** | self-pay USDT 买入 | ≥ 5 | 同上 |
| **GToken** | 质押换 ticket(SBT)、创建社区 | ≥ 数个 | 先用本套 gasless 买入获得 |
| **aPNTs** | gasless 转账/Guard 写的 PaymasterV4 gas、社区积分 | ≥ 数十 | gasless 买入获得 |
| **SBT(ticket)** | 加入社区 | 1 | D2 质押 GToken 换取 |

> 余额由 `check-prereqs` 用 SDK `TokenSaleClient.getBalances` 实测；不足会列出缺口。

---

## 5. 按领域的准备矩阵

| 领域 | 需要的准备 | 怎么检查 |
|---|---|---|
| D1 注册/账户 | 后端+KMS 在线、测试邮箱（或 OTP 测试通道）、L3 passkey 用 CDP（无需真机） | 服务体检 + OTP 通道 |
| D2 Tokens/门票 | 测试 EOA + USDC/USDT/ETH、DVT relay 在线、sale 栈(Sepolia) | balances + DVT + getPrices |
| D3 Guard | `TEST_AIR_ACCOUNT`(带 guard) + aPNTs(付 gas) + 设备 passkey(CDP) | guard() != 0 + aPNTs 余额 |
| D4 Transfer | 测试 AirAccount + 余额 + KMS + bundler + (gasless 需 aPNTs/paymaster) | 账户余额 + bundler |
| D5 恢复/Guardian | 带 2 guardian 的账户、第二钱包(MetaMask 渠道)、CDP(passkey 渠道) | guardian 列表 |
| D6 社区管理员 | 测试 EOA + GToken(创建社区) + registry/xPNTsFactory/SuperPaymaster 地址(SDK) | GToken 余额 + 合约可读 |
| D7 社区用户 | SBT(ticket) + 已存在社区 | SBT 持有 + community/list |
| D8 协议运营者 | 测试 EOA + 质押额(GToken/ETH) + SuperPaymaster/PaymasterFactory(SDK) | 余额 + 资源前置检查 |
| D9–D12 | 视用例：SBT、NFT、admin 权限账户 | 各自 reader |

---

## 6. 待办 / 需你提供

- **OTP 测试通道**：L3 注册要全自动需后端在 `NODE_ENV=test` 暴露可读 OTP（或固定码）。当前没有 → 注册用例先半自动（你读邮件填码）或我加一个测试通道（需你同意改后端）。
- **测试 EOA 私钥**：放 `scripts/test/.env.test` 的 `TEST_EOA_PRIVATE_KEY`（**勿提交**）。本会话验证过的 `0xb56000…0E` 可用（有 283 USDC）——但其私钥在 7702 实验脚本里，正式测试建议你给一个专用测试私钥。
- **主网预算**：主网用例需小额真金（USDC/ETH）+ 主网 sale/DVT/Guard 栈就绪（当前 `blocked`）。
- **第二钱包**：guardian MetaMask 渠道 / 收款人用例。

---

## 7. 检查脚本

```
node scripts/test/check-prereqs.mjs            # 体检（默认 Sepolia）
node scripts/test/check-prereqs.mjs --mainnet  # 主网体检（需 MAINNET_ENABLED）
```
输出每项 ✅/⚠️/❌ + 缺失项的补法；**有 ❌（critical）则退出码非 0，测试不应开始**。

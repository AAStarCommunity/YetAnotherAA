# 🧑 手工复现：GRD-04 Guard 写（人工真机走查）

> 目的：用**真机 passkey** 真实走一遍"带 guard 账户 → 部署 → Guard 写"，**判定 AA24 到底是真 bug 还是自动化 harness（CDP/KMS 模拟）的伪影**。
> 自动化里：UI render race 已修、AA21 已用 EntryPoint deposit 修，但首次部署 UserOp 卡在 **AA24 signature error**——而那笔 UserOp 失败 ⇒ guard 从未真正上链，所以 guard 写从未被真正验证。
> 背景：Guard 写**机制**已在 #362 交付（/guard + GuardClient）；这里卡的是 guard 账户**首次上链**。

## 前置
- 后端 **普通 dev**（`KMS_DIAG=true npm run start:dev -w aastar`，**不要** OTP_TEST_MODE——走真实邮箱 OTP）；前端 `npm run dev -w aastar-frontend`（:5173）。
- 一个有 Sepolia ETH 的钱包（给新账户注资用）。
- 浏览器（真机 passkey：Mac Touch ID / iPhone Face ID）。

## 步骤

### 1. 注册（真机 passkey）
浏览器开 http://localhost:5173/auth/register → 填邮箱 → 收**真实邮件**里的 6 位码 → 输入 → **用 Touch ID/Face ID 创建 passkey** → 落到 /dashboard。

### 2. 创建带 guard 的账户（dailyLimit>0）—— 当前无 UI 入口，用 curl
浏览器控制台取 token：`localStorage.getItem("token")`，然后：
```bash
TOKEN="<粘贴上面的 token>"
curl -X POST http://localhost:3000/api/v1/account/create \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"dailyLimit":"0.01","entryPointVersion":"0.7"}'
# 取账户地址
curl -s http://localhost:3000/api/v1/account -H "Authorization: Bearer $TOKEN"
```
记下账户地址 `0x…`。

### 3. 注资
从你的钱包给该账户地址转 **0.05 Sepolia ETH**（部署+转账 gas）。

### 4. 【关键】首次转账（部署账户+guard）
浏览器**刷新** /dashboard（让它读到新账户）→ 进 /transfer → 收款填任意地址、金额 `0.001` → **Send Transfer → 用真机 passkey 确认**。
- **观察**：是否上链成功？还是报错（AA21 / AA24 / 其他）？

### 5. 确认 guard 已部署
转账成功后，进 /guard → 应显示守卫策略（每日限额/严格模式）。若显示 "无守卫" 说明 guard 没随账户部署。

### 6. Guard 写：切换严格模式
/guard → 点 "Strict mode … tap to enable/disable" → **真机 passkey 确认** → 观察严格模式是否翻转。

---

## 判定（请填）

| 观察点 | 结果（你填） |
|---|---|
| 步骤 4 首次转账：成功 / AA21 / AA24 / 其他 |  |
| 若失败，错误原文 |  |
| 步骤 5 /guard 是否显示守卫（guard 是否部署） |  |
| 步骤 6 严格模式是否翻转成功 |  |
| 涉及的 tx / UserOpHash |  |

**结论判定**：
- 步骤 4 **真机成功部署** → AA24 是**自动化 harness 伪影**（CDP/KMS 模拟签名问题），guard 机制正常，e2e 待改 harness；
- 步骤 4 **真机也 AA24** → **真 bug**：带 guard 账户首次交易的分级签名/验证边界，需后端/合约修；
- 步骤 4 **AA21** → prefund 问题（自动化里用 `EntryPoint.depositTo(account)` 已可绕过，手工可同样预存 deposit）。

> 走完把上表结果发我，我回填到 `docs/TEST_RESULTS.md` S4 / GRD。

# 测试结果台账（Test Results — living log）

> 配套 `TEST_PLAN.md`（用例）+ `TEST_PREPARATION.md`（准备）。
> 本文档**逐阶段记录真实测试结果**：每条自动化用例附**链上 tx / 证据文件**；每条**人工测试**用 🧑 明确标出 + 给操作步骤。
> 证据原始 JSON 在 `docs/test-evidence/<net>/<caseId>.json`。
> 最后更新：2026-06-24 ｜ 网络：Sepolia（主网 = `待栈就绪`）

---

## 分阶段执行计划（一阶段一 PR）

| 阶段 | 范围 | 层 | 状态 |
|---|---|---|---|
| **S1** | D2 Tokens 买入/质押 | L1 viem（EOA 自签） | 🟢 进行中（本 PR） |
| **S2** | 后端路由：鉴权守卫（确定性）+ 读端点发现 | L2 Jest e2e | 🟢 完成（10/10 绿） |
| **S3** | 注册 passkey 流（CDP 虚拟认证器）+ 公开页/鉴权重定向 | L3 Playwright | 🟢 完成（5/5 绿） |
| **S4** | AirAccount UserOp 流：转账 + Guard 写 | L3 Playwright | 🟢 转账全自动跑通（XFER-01 ✅）；Guard 写待补 |
| **S5** | 社区/运营者：建社区、Gas 策略、加入/退出 | L1 + L3(测试钱包) | ⬜ |
| **L4** | 真机 passkey / 真 MetaMask / 主网真金 | 🧑 人工 | ⬜ 全程人工 |

> 推进方式：每阶段**建脚本 → 实跑 → 回填本文档 + 证据 → TPR**，合并后进下一阶段。

---

## S1 — D2 Tokens（L1 链上）

执行账户（测试 EOA）：`0xb5600060e6de5E11D3636731964218E53caadf0E`
跑法：`npm run test:onchain TOK-03`（先 `npm run test:prereqs` 全绿）

| 用例 | 型 | 方法 | 状态 | 凭证 / 说明 |
|---|---|---|---|---|
| **TOK-03** self-pay 买 GToken（USDC，自付 gas） | ✅正向 | L1 自动 | ✅ **PASS** | tx [`0xab98b5b2…`](https://sepolia.etherscan.io/tx/0xab98b5b26d446be3df3c124642aebc8d446d74a4b4420c2da618ee3a3ea2e111) · block 11127417 · 自付 gas · 6.667 GToken · 证据 `test-evidence/sepolia/TOK-03.json` |
| **TOK-01** gasless 买 aPNTs（USDC EIP-3009 → DVT relay） | ✅正向 | L1 自动 | ✅ **PASS（0.26.7）** | tx [`0x2360ce02…`](https://sepolia.etherscan.io/tx/0x2360ce021be026e9c3f7db9b8daae723d5d33649c3a4a5de5bcf86598b179832) · relayer 代付 · aPNTs 到账。回归史：0.26.4 成功 → 0.26.5 签名回归 → 0.26.6 relayer pending（[sdk#163](https://github.com/AAStarCommunity/aastar-sdk/issues/163)）→ **0.26.7 EIP-3009 改签 ReceiveWithAuthorization 闭合窗口**，本仓已 bump 0.26.7 |
| **TOK-04** self-pay 买（USDT） | ✅正向 | L1 自动 | ⛔ **阻塞** | 测试 EOA **USDT 余额 = 0**，需注资后再跑（体检会提示） |
| **TOK-06** 滑点保护（demand 10× minOut 必须被拒） | ⚠️异常 | L1 自动 | ✅ **PASS** | **断言为合约 revert**（viem `ContractFunctionRevertedError`，非网络/余额错误才算）→ `buyTokens reverted`，滑点保护生效 · 证据 `TOK-06.json` |
| **TOK-09** gasless 非法收款人拦截 | ⛔逆向 | L3 | ⬜ S3 | UI 层 `isAddress` 校验，归 L3 |
| **TOK-11** 质押 GToken → ticket(SBT) | ✅正向 | L1 | ⛔ **阻塞** | 见下 🐛：FinanceClient 实例方法在 node 解析错链；且质押是**角色制**（`getStakeInfo{operator,roleId}`），ticket→SBT 非简单 `stake(amount)`，需 SDK 澄清 ticket-mint 流程 |

**S1 小结**：gasless（TOK-01，0.26.7 解封）+ self-pay（TOK-03）+ 滑点保护（TOK-06，经 Codex 4 轮加固）**3/3 真实跑通并留证**；USDT 待注资；质押→SBT 阻塞（角色制）。`npm run test:onchain` 默认 3 绿。

### 🐛 S1 发现（待报 SDK）
- **FinanceClient 实例方法在 node/L1 下解析错链**：`new FinanceClient(pc, wc).getGTokenBalance()/approveAndStake()` 即使先 `applyConfig({chainId:11155111})` 仍命中无代码地址 → `balanceOf returned 0x`。直接 `getCanonicalAddresses(11155111).gToken` 的 `balanceOf` 正常（379.67）。疑似 `@aastar/sdk/core` 与 `/tokens` 两个 entry 的 config state 不共享。**workaround**：用显式 `getCanonicalAddresses(chainId)` + 静态 `stakeGToken`（TOK-11 脚本已采用，但卡在角色制质押语义）。

---

## S2 — 后端 API（L2 Jest e2e）

跑法：`npm test:e2e -w aastar`（无需链上钱；纯 HTTP 层）。**结果：2 suites / 10 tests 全绿**（确定性，不依赖实时 RPC）。

| 覆盖 | 状态 | 说明 |
|---|---|---|
| **JwtAuthGuard 401**：account/create、guardian/:addr、bls/nodes、community/dashboard、operator/dashboard、admin/dashboard | ✅ **6/6 PASS** | 无 token 一律 401，确定性 |
| paymaster/presets 鉴权 + SDK canonical 地址 | ✅ PASS | 守住 0x957852… 防地址回归（沿用既有 spec） |
| transfer/prepare、transfer/submit 401 | ✅ PASS | 既有 spec |

### 🐛 S2 发现（测试抓到的真问题，记录待修）

| 端点 | 现象 | 判断 | 建议 |
|---|---|---|---|
| **GET /operator/status** | 无 token → **500**（`hasRole(user=undefined)`） | **真 bug**：公开端点却按调用者地址查角色，没处理无用户 | 加 JwtAuthGuard（用户态）**或**无用户时返回默认/空，而非 500 |
| GET /community/list | 线上 `curl :3000` → **200**（返回真实社区）；冷 ts-jest AppModule → 500 | 环境敏感（非代码 bug，线上可用） | 读端点改由 L1(viem 直读) 或 warm-server 覆盖 |
| GET /admin/*、registry/info | 时好时坏（`fetch failed`） | **RPC 依赖**，e2e 负载下 Infura 限流/超时 | 同上：链读端点不适合裸 e2e 断言，需 RPC mock 或 warm-server |

> **结论**：L2 e2e 适合测**确定性的鉴权/契约**；**链读端点本质 RPC-flaky**，归 L1 或 warm-server/手工。operator/status 的 500 是本阶段值得修的真 bug。

---

## S3 — 浏览器 E2E（L3 Playwright + CDP 虚拟认证器）

跑法：`npm run test:e2e:ui -w aastar-frontend`（前端 :5173 + 后端 :3000 需在跑；注册流需后端 `OTP_TEST_MODE=true`）。**结果：5/5 绿。** passkey 用 **CDP `WebAuthn.addVirtualAuthenticator` 全自动**，无需真机。

| 用例 | 型 | 状态 | 说明 |
|---|---|---|---|
| **AUTH-02** 注册全流程 | ✅正向 | ✅ **PASS（6s）** | email → **devCode OTP**（gated 测试模式）→ **passkey 注册 ceremony（CDP 虚拟认证器）→ KMS AirAccount** → 落 dashboard，**完全自动** |
| **AUTH-10** 鉴权重定向 | ⛔逆向 | ✅ PASS | 未登录访问 `/dashboard` → 跳 `/auth/login` |
| 公开 landing 加载 | ✅正向 | ✅ PASS | 标题 Cos72 |
| register email step | ✅正向 | ✅ PASS | email 输入可见 |
| CDP 虚拟认证器装载 | — | ✅ PASS | passkey 自动化基础设施 smoke |

**OTP mock（已确认方案 1）**：后端 `requestOtp` 在 `OTP_TEST_MODE=true` 且**非 production** 时，于响应里附带 `devCode`（6 位真验证码，验证逻辑不变），e2e 读取即可完成注册——**仅测试模式暴露，prod 永不**。

> 基础设施：`aastar-frontend/playwright.config.ts` + `e2e/helpers/webauthn.ts`（CDP 虚拟认证器）+ `e2e/{public,register}.spec.ts`。

---

## S4 — AirAccount UserOp 流（L3，进行中）

复用 S3 的 CDP 虚拟认证器。脚手架：`e2e/helpers/register.ts`（注册+建账户）、`e2e/helpers/fund.ts`（注资 ETH）、`e2e/transfer.spec.ts`。

| 步骤 | 状态 | 说明 |
|---|---|---|
| 注册（CDP passkey）→ KMS wallet | ✅ 验证 | 复用 S3 |
| **创建 AirAccount**（`POST /account/create`，`entryPointVersion:"0.7"`，counterfactual） | ✅ 验证 | 默认 v0.6 未配置会 500 → 必须传 0.7 |
| **注资**（测试 EOA → 新账户 0.02 ETH） | ✅ 验证 | self-pay 部署+转账 gas |
| **XFER-01 首次转账（部署+执行，passkey ceremony）** | ✅ **PASS（~35s/1.5m）** | `/transfer` 填 to+amount → "Send Transfer" → **CDP passkey 断言 → KMS + BLS signer 网络 + bundler → 首次 UserOp 部署账户(initCode)+执行** → 提交返回 UserOpHash/txHash（断言）。**完全自动化** |
| Guard 写（GRD-03~06） | ⬜ 待补 | 复用同一 register→create→fund→passkey 链；账户创建时设 dailyLimit>0 即带 guard，再经 `/guard` 页提交 encodeXxx UserOp |

**S4 小结**：**转账全链路自动化跑通**（注册→建账户(v0.7)→注资→dashboard 刷新→/transfer→passkey ceremony→部署+执行）。两个关键修复：(a) 建账户后回 /dashboard 刷新让 DashboardContext 缓存到新账户，/transfer 才渲染表单；(b) DVT/BLS 在线后完整严格 ceremony（KMS+BLS+bundler+部署）跑通。注资 helper 用显式 12/2 gwei 确保 Sepolia 及时上链。Guard 写沿用同一链路，下一子步。

---

## 🧑 需人工测试的用例（L4，本阶段先登记，后续逐条做）

> 这些**无法自动化**或必须人验，做时在此回填截图 + tx：

| 用例 | 为什么人工 | 操作要点 |
|---|---|---|
| AUTH-02/04 真机注册/登录 | iCloud/Google passkey 跨设备同步 | 真手机 Face ID 注册 → 另一设备登录验证同步 |
| TOK-05 网络切换 | 真 MetaMask 切链弹窗 | /tokens 切 OP/ETH，确认 MetaMask 弹出切链 |
| XFER-03 Tier-3 大额转账 | guardian ECDSA 真签 | 触发 guardian 协签，确认上链 |
| 主网全部用例 | 真金 | 最小金额复跑 S1~S5，证据标 `mainnet` |

---

## 需你配合（blockers）

- **USDT 注资**：TOK-04 需测试 EOA 有 USDT（当前 0）。
- **主网栈**：sale/DVT/Guard 主网未部署 → 主网用例 `blocked`。
- 其余我能自动跑的，逐阶段推进，无需你介入；到 🧑 人工点我会单独抛出。

---

## 复跑方式

```bash
npm run test:prereqs                 # 体检(未全绿不开测)
npm run test:onchain                 # 跑全部已注册 L1 用例
npm run test:onchain TOK-03          # 单条
# 证据写入 docs/test-evidence/<net>/<caseId>.json
```

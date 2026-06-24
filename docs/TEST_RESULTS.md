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
| **S2** | 后端路由：鉴权守卫 + 只读聚合（community/operator/role/address-book） | L2 Jest e2e | ⬜ 下一阶段 |
| **S3** | 注册/登录 passkey 流（CDP 虚拟认证器） | L3 Playwright | ⬜ |
| **S4** | AirAccount UserOp 流：转账(Tier1/2/3) + Guard 写 | L3 + 半自动 | ⬜ |
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
| **TOK-01** gasless 买 aPNTs（USDC EIP-3009 → DVT relay） | ✅正向 | L1 自动 | 🟡 **部分** | 0.26.4 曾成功（tx `0x49040263…`）；0.26.5 签名回归→0.26.6 已修（relayer 接受）；当前 relayer 侧 tx **pending 未挖出** = infra 层，已报 [aastar-sdk#163](https://github.com/AAStarCommunity/aastar-sdk/issues/163) |
| **TOK-04** self-pay 买（USDT） | ✅正向 | L1 自动 | ⛔ **阻塞** | 测试 EOA **USDT 余额 = 0**，需注资后再跑（体检会提示） |
| **TOK-06** 滑点保护（minOut=quoted×98%） | ⚠️异常 | L1 | ⬜ 待补 | 已在买入脚本内置 2% floor；专项构造劣价用例待补 |
| **TOK-09** gasless 非法收款人拦截 | ⛔逆向 | L3 | ⬜ S3 | UI 层 `isAddress` 校验，归 L3 |
| **TOK-11** 质押 GToken → ticket(SBT) | ✅正向 | L1 自动 | ⬜ 待补 | SDK 有 `stakeGToken/approveAndStake`，下一子步接入 |

**S1 小结**：self-pay 买入路径**已真实跑通并留证**；gasless 受 relayer infra 影响（非 YAA 代码，已上报）；USDT/质押待注资/接 API。

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

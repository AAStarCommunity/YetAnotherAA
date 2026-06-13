# Registry 运营门户对 SDK 的业务诉求与能力差距

> 视角:把 registry 仓库的 8 个核心运营业务流程,基于 `@aastar/*` SDK(而非直接调合约 ABI)在 YAA 内重建。本文从业务流程出发,列出对 SDK 的诉求与当前覆盖差距,作为 YAA↔SDK 协作凭证。
> 关联:流程原始定义见 `AAStarCommunity/registry` 仓库的 `docs/CORE_FLOWS.md`(跨仓库,不在本仓库内);本仓库内:[sdk-current-survey-and-expectations.md](./sdk-current-survey-and-expectations.md)、[sdk-infra-upgrade-analysis-2026-06.md](./sdk-infra-upgrade-analysis-2026-06.md)

## 背景

registry(Vite+React+ethers SPA)直接 `new ethers.Contract(address, abi)` 调链,无抽象、大量重复。组织目标是所有能力经 SDK 构建。调研确认 registry 业务能力在 SDK 里**已覆盖约 75%**,但不在 `@aastar/airaccount`,而在 **`@aastar/core`(registry/staking/sbt/superPaymaster/factory actions)+ `@aastar/operator` + `@aastar/community` + `@aastar/tokens` + `@aastar/identity`**(均 viem-based,npm 0.18.x)。

## 8 流程 × SDK 覆盖差距矩阵

| 流程 | 所需能力 | SDK 现状 | 状态 | 缺口/诉求 |
|------|---------|---------|------|----------|
| 1 AOA 准入 | registerCommunity + 部署 PaymasterV4 + EntryPoint 充值 | `PaymasterOperatorClient.deployAndRegisterPaymasterV4()` + `registry/factory/entryPoint actions` | ✅ 基本完整(幂等已做) | 确认 `updateCommunity` 暴露 |
| 2 AOA+ 准入 | registerCommunity + lockForSuperPaymaster + registerOperator + depositAPNTs | `OperatorLifecycle.setupNode()` / `registerAsSuperPaymasterOperator()` + `staking/superPaymaster actions` | ✅ 完整 | — |
| 3 xPNTs 管理 | deployToken + 绑定 Registry + mint | `xPNTsFactoryActions.deployxPNTsToken()`(可用);`CommunityClient.issueXPNTs()`(**有 bug**) | ⚠️ 部分 | 🔴 `issueXPNTs()` 签名错误 + 返回零地址,需修;先直调 factory action + 事件解析 |
| 4 用户领 SBT | mintOrAddMembership + getUserSBT + getMemberships | `sbtActions.airdropMint/mintForRole`、`checkMySBT()` | ⚠️ 部分 | 🔴 缺 `mintOrAddMembership` 语义;`getMySBTId()` 未实现 |
| 5 批量铸造 SBT | 逐地址转 GT + mintOrAddMembership + 进度回调 | 仅逐个 `airdropMint` | ⚠️ 部分 | 🔴 **无 batch API**(`batchAirdropMint(users[],roleIds[],datas[])`)+ 无进度回调 |
| 6 AOA 日常运营 | PaymasterV4 配置读写 + EntryPoint 充值 | `paymasterFactory/entryPoint actions` 部分 | ⚠️ 部分 | PaymasterV4 配置 getter/setter(serviceFeeRate/treasury/supportedSBTs/gasToken/pause)封装确认 |
| 7 AOA+ 日常运营 | SuperPaymaster.accounts + depositAPNTs + 声誉 | `superPaymasterActions` + `ReputationClient` | ✅ 基本完整 | `getReputation` 分社区分解缺失 |
| 8 资源前置检查 | 并发查 6-8 项 + 60min 缓存 | `RequirementChecker`(未导出,分散) | ⚠️ 部分 | 🔴 **无统一 `checkResources(wallet,mode)` 框架**;导出可复用 PreFlightChecker |

## 重点诉求(给 SDK 团队,按优先级)

1. 🔴 **修 `CommunityClient.issueXPNTs()`**:当前调 `createXPNTs(symbol,supply,rate)`,实际工厂签名是 `deployxPNTsToken(name,symbol,communityName,communityENS,exchangeRate,paymasterAOA)`;且返回零地址(未解析部署事件)。
2. 🔴 **SBT 批量铸造 API**:`batchAirdropMint(users[], roleIds[], datas[])` + 进度回调(`BatchExecutionProgress`),覆盖 registry 流程 5;并补 `mintOrAddMembership` 语义(用户自领)。
3. 🔴 **统一资源前置检查框架**:把 `RequirementChecker` 导出为 `core` 可复用服务,提供 `checkResources(wallet, mode)` 聚合查询(注册/xPNTs/paymaster/GT 余额/ETH/SuperPaymaster/aPNTs)。
4. 🟡 **实现 `configureSBTRules()` / `getCommunityStats()`**(当前 NotImplementedError)。
5. 🟡 **Registry 查询补全**:`updateCommunity` / `getCommunities` / `getCommunityProfile` / `isRegisteredCommunity` 的链上 action(或明确改用 subgraph 的指引)。
6. 🟡 **`identity` 补全**:`getMySBTId()` 实现、`getReputation` 分社区分解。
7. 🟢 **Signer 适配**:registry 原用 ethers,SDK 用 viem `Account/WalletClient`;提供 ethers→viem 适配指引,并确认 **Safe 多签(@safe-global/safe-apps-sdk)** 签名路径可用。
8. 🟢 **地址/ABI 单一来源**:`@aastar/core` `CANONICAL_ADDRESSES` 与 registry 用的 `@aastar/shared-config` 的关系澄清,避免双重维护。

## YAA 侧采用策略(不等 SDK 全修完)
- 直接用编排层 `@aastar/sdk` 的 `CommunityClient.launch()` / `OperatorClient.onboardOperator()`(流程 1/2)。
- xPNTs 部署(流程 3)绕开 `issueXPNTs` bug,直调 `xPNTsFactoryActions.deployxPNTsToken()` + 事件解析。
- 批量铸造(流程 5)先在 YAA 侧用循环 + 逐个 `airdropMint` 兜底,待 SDK 出 batch API 后替换。
- 资源检查(流程 8)先在 YAA `lib/resources/` 复刻 registry 的聚合 + 60min 缓存,底层调 SDK 只读 action,待 SDK 出 PreFlightChecker 后替换。

# aastar-sdk 现状调研与期望(YAA 视角)

> 目的:在 SDK 重构期,从 YAA 这个主要消费方的视角,记录 `@aastar/*` 各包当前能力、消费方式与期望方向,供 SDK 团队参考。
> 关联:[sdk-requirements-registry-portal.md](./sdk-requirements-registry-portal.md)、[sdk-infra-upgrade-analysis-2026-06.md](./sdk-infra-upgrade-analysis-2026-06.md)

## monorepo 概览

aastar-sdk 是 pnpm workspace,发布 ~18 个 `@aastar/*` 包。两条消费线:
- **终端用户/账户抽象线**:`@aastar/airaccount`(0.19.0,YAA 后端经 `/server` 入口使用)——账户、转账、BLS、paymasterData、KMS、ForceExit、EIP-7702。**自带地址+ABI 副本,零 `@aastar/*` 内部依赖**。
- **运营/治理线(viem-based,0.18.x)**:`@aastar/core` + `community/operator/tokens/identity/paymaster` + 编排层 `@aastar/sdk`——Registry/质押/xPNTs/Paymaster 部署/SuperPaymaster/SBT/声誉。这条线与 registry 运营门户需求对齐。

> 注意版本错位:`airaccount` 在 0.19.0,运营线包在 0.18.0。对只引 `airaccount` 的消费方(YAA 当前后端)无错配;但同时引两条线时需留意。

## 各包现状能力(运营线)

| 包 | 版本 | 核心导出 | 成熟度 |
|----|------|---------|--------|
| `@aastar/core` | 0.18.0 | `CANONICAL_ADDRESSES`(按链 ID)、`abis/index.ts`(Registry/GToken/Staking/SuperPaymaster/xPNTsFactory/PaymasterFactory/MySBT/EntryPoint)、actions:`registry/staking/sbt/superPaymaster/factory/entryPoint`、`BaseClient`(viem WalletClient+PublicClient) | ✅ 基础 action 完整 |
| `@aastar/operator` | 0.18.0 | `PaymasterOperatorClient`(registerAsSuperPaymasterOperator / deployAndRegisterPaymasterV4 / depositCollateral / configureOperator)、`OperatorLifecycle`(setupNode / withdrawAllFunds) | ✅ 流程编排到位 |
| `@aastar/tokens` | 0.18.0 | `FinanceClient`(approveAndStake / getGTokenBalance / getAPNTsBalance / getTokenomicsOverview) | ✅ 完整 |
| `@aastar/community` | 0.18.0 | `CommunityClient`(launch ✅ / issueXPNTs 🔴bug / configureSBTRules 🔴未实现 / getCommunityStats 🔴未实现) | ⚠️ 部分 |
| `@aastar/identity` | 0.18.0 | `checkMySBT` / `getMySBTId`(🔴未实现)、`ReputationClient`(computeScore / getGlobalReputation / getCreditLimit) | ⚠️ 部分 |
| `@aastar/paymaster` | 0.18.0 | `SuperPaymasterClient.submitGaslessTransaction()`(gas 估算+效率调优) | ✅ 完整 |
| `@aastar/sdk` | 0.18.0 | 上层编排:`CommunityClient.launch()`、`OperatorClient.onboardOperator()` | ✅ 端到端流程 |

## 架构现状(优点)
- **地址/ABI 单一来源**:`@aastar/core` `CANONICAL_ADDRESSES` + `abis/index.ts`,按链 ID 组织,合约版本经 `version()` 读取(ABI 命名无版本号)。
- **读写分层**:actions 接受 `PublicClient | WalletClient`;`BaseClient.getStartPublicClient()` 回退。
- **流程组合层**:已有 `launch()` / `onboardOperator()` / `setupNode()` / `approveAndStake()` 等编排先例。
- **Signer 抽象**:基于 viem `Account/WalletClient`,支持任意 viem account;各 action 接受 `account?: Account|Address` 覆盖。

## 期望方向(供重构参考)
1. **统一两条线的版本与地址源**:`airaccount` 自带地址副本 vs `core` 的 `CANONICAL_ADDRESSES` 易漂移;建议地址/ABI 收敛到单一包(如 `core`),`airaccount` 依赖之而非复制。
2. **补齐运营线缺口**(详见 requirements 文档):`issueXPNTs` 修复、SBT `batchAirdropMint` + 进度回调、统一 `PreFlightChecker`、`configureSBTRules`/`getCommunityStats`/`getMySBTId` 实现。
3. **吸收 infra 破坏性变更**:`executeUserOp` callData 包装、paymasterData 格式差异、`APNTS_TOKEN` 运行时解析,都应在 SDK 内屏蔽(详见 infra 分析文档)。
4. **ethers↔viem 边界**:registry/旧消费方用 ethers,SDK 用 viem;提供官方适配器与 Safe 多签签名路径示例。
5. **adapter 契约稳定**:`IStorageAdapter`/`ISignerAdapter`/record 类型变更走 semver major,给消费方适配窗口。
6. **CHANGELOG 与代码一致**:当前 `airaccount` 0.19.0 changelog 未反映 beta.3 实质(ForceExit/EIP-7702/新地址),消费方易被误导。

## YAA 的消费现状(供 SDK 团队了解下游)
- 后端 NestJS 经 `@aastar/airaccount/server` 注入 `YAAAServerClient` + 两个 adapter;6 子模块(accounts/ethereum/bls/transfers/paymaster/tokens)约 30 个方法。
- 运营门户(本次新增)将经运营线 `@aastar/core`+`operator`+`community` 在前端用 viem WalletClient 发交易(运营者 EOA/Safe 客户端签名)。
- 技术债:`transfer.service.ts` 硬编码 v4 地址(详见 infra 文档),正在清理收敛回 SDK。

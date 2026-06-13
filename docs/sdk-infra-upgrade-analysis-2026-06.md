# YAA × SDK × Infra 升级分析(2026-06)

> 范围:YAA 通过 `@aastar/airaccount` SDK 集成 KMS / SuperPaymaster / AirAccount 合约。本文梳理 infra 三件套近期新版本对 YAA 的影响与待办。
> 关联文档:[sdk-requirements-registry-portal.md](./sdk-requirements-registry-portal.md)、[sdk-current-survey-and-expectations.md](./sdk-current-survey-and-expectations.md)

## 一句话结论

YAA 设计原则是"所有 infra 能力都经 `@aastar/airaccount` SDK 调用",但已偏离:YAA 在 `aastar/src/transfer/transfer.service.ts` 硬编码了 v4 时代合约地址,绕过了 SDK。infra 三件套近期高频迭代,YAA 需要重新收敛回 SDK——大部分破坏性变更应由 SDK 吸收,YAA 只需升级依赖 + 清理硬编码 + 接入新能力。

## 集成拓扑(已核实)

```
YAA 后端/前端 ──→ @aastar/airaccount (aastar-sdk monorepo packages/airaccount, 0.19.0, 仅用 /server 入口)
                     ├─→ SuperPaymaster 合约 (v5.3.3-beta.3)
                     ├─→ AirAccount 账户合约 (v0.17.2-beta.3 → beta.4)
                     └─→ KMS / TEE (AirAccount repo, v0.20.0)
```

- `@aastar/airaccount` 由 aastar-sdk monorepo 的 `packages/airaccount/` 发布,**零 `@aastar/*` 内部依赖**,自带地址与 ABI 副本(`src/server/constants/entrypoint.ts`)。
- YAA 经两个 adapter 向 SDK 注入持久化与签名:`IStorageAdapter`(12 方法)/ `ISignerAdapter`(3 方法)——这是 YAA↔SDK 的核心契约、最敏感的破坏面。

## infra 这轮变化(对 YAA 有影响的)

| infra | 版本 | 关键变化 | 性质 |
|------|------|---------|------|
| AirAccount 合约 | v0.17.2-beta.3→beta.4 | ① **algId/bundler 修复**:guard 账户必须用 `executeUserOp` 包装 callData,否则过不了 Pimlico 估算 ② router 地址变更 ③ 删除 3 个旧 validator,合并为 `SessionKeyValidator` ④ **仅支持 EntryPoint v0.7** | 🔴 破坏性 |
| SuperPaymaster | v5.3.3-beta.3 | ① Paymaster 地址全换(旧 PMv4/aPNTs 已不在部署集)② **APNTS_TOKEN 迁移中**(7 天 timelock,约 2026-06-20 生效)③ 赞助资格需持 SBT 或注册 ERC-8004 agent ④ paymasterData:SuperPaymaster 104B(operator+maxRate)≠ PMv4 72B(token) | 🔴 破坏性 |
| aastar-sdk | airaccount 0.19.0 | 已同步 beta.3 地址/ABI;**新增 `ForceExitService` + `EIP7702DelegateService`**;但 CHANGELOG 陈旧、beta.4 未跟进 | 🟡 需对齐 |
| KMS / TA | v0.20.0 | challenge-binding-v2(当前 transition 兼容模式);wallet 上限 100→30000 | 🟢 当前兼容,需提前迁移 |

## YAA 自身待办

### P0(必须做)
- **A1. 清理硬编码地址**:`transfer.service.ts:22-23` 的 `PMV4_ADDRESS=0xd0c82d…` 与 `APNTS_TOKEN=0xDf6698…` 均为 v4 时代地址,v5.3.3 部署集已 grep 零命中;`scripts/update-superpaymaster-price.js:16-17` 同样硬编码。→ 全删,改由 SDK 提供;aPNTs **运行时读 `SuperPaymaster.APNTS_TOKEN()`**(6/20 前后会变,不能写死)。
- **A2. EntryPoint 版本对齐**:YAA 配 v0.6/0.7/0.8、默认 0.6,但 AirAccount 账户合约**仅支持 v0.7**;`ethereum.service.ts:87` 的 `detectAccountVersion` 是坏桩(永远返回 V0_6)。→ 默认改 0.7,清理 v0.6/v0.8 死配置。
- **A3. 升级 SDK 依赖**:`^0.19.0` 当前指向 feature 分支代码;等 SDK 出含 beta.4 ABI/地址的正式发布再升级(前置条件)。

### P1(强烈建议)
- **A4. KMS ceremony 迁移到 TA-issued challenge**:当前 transition 模式(`ENFORCE_TA_CHALLENGE=false`)不受影响,但上游计划切 STRICT;提前改成经 `BeginAuthentication`/`GetChallenge` 取 KMS 下发 challenge。
- **A5. 去掉脆弱私有字段依赖**:`kms.service.ts:31` 访问 `(kmsManager as any).http`,SDK 内部一改即静默失效;改用官方 logger/hook。
- **A6. 统一 KMS endpoint**:`ecosystem.config.js`=`kms.aastar.io`、`kms.service.ts` 默认 `kms1.aastar.io`、前端代理 `kms1`——统一集中配置。

### P2(增量能力)
- 接入 SDK 0.19.0 已具备但 YAA 未用的:`ForceExitService`(2/3 guardian 紧急 L2→L1 提款)、`EIP7702DelegateService`(EOA→AA 升级)、`SessionKeyService`/`ModuleManager`(ERC-7579 + agent session key)、`ERC8004Service`(agent 身份/声誉,关联 SuperPaymaster 赞助资格)。

## 对 SDK 的诉求(吸收破坏性变更)
凡是"地址会变、格式会变、链上交互细节会变"的,应由 SDK 吸收,YAA 不该感知:
1. **出干净正式发布并跟进 beta.4**(含 `executeUserOp`+`approvedAlgorithms` ABI、新 router 地址);CHANGELOG 如实写。
2. **`executeUserOp` callData 包装封装进 SDK 的 TransferManager**,YAA 继续调 `client.transfers.executeTransfer()` 不改签名。
3. **统一地址解析 + 运行时读 `APNTS_TOKEN()`**。
4. **PaymasterManager 屏蔽 PMv4(72B)vs SuperPaymaster(104B)格式差异**;并把 YAA 自己实现(注释标 "SDK doesn't include this")的 `validatePaymasterSignature`/`analyzeTransaction` 推进 SDK。
5. **暴露官方 `ILogger`/请求 hook** 替代 hack 私有 http。
6. **赞助资格查询/注册封装**(`isEligibleForSponsorship` 等价物)。
7. **adapter 契约稳定性承诺**(`IStorageAdapter`/`ISignerAdapter`/record 变更走 semver major)。

## 关键风险
- **beta.3 vs beta.4 窗口期**:合约 beta.4 是非升级式重新部署,beta.3 旧账户(non-upgradable)无法回填 `executeUserOp`,走 bundler 需迁到 beta.4 新账户。需上游给出 beta.4 部署地址表。
- **APNTS_TOKEN 6/20 切换**:期间任何写死/缓存 aPNTs 地址都会出错。
- **0.19.0 是否真发到 npm**:`^0.19.0` 解析依赖 npm 上确有该版本(已确认 npm 有 0.19.0,但是否含 beta.3 实质需核对)。

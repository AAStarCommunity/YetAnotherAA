# YAA × SDK 0.19 + DVT infra 升级:变化分析与调整计划(2026-06)

> 触发:aastar-sdk 收尾发布 **0.19.0**(钉 AirAccount contracts v0.18.0-beta.1 / SuperPaymaster v5.4.0-beta.1 / KMS 0.22.0 / DVT v1.2.0),infra 四仓库全部出新版。YAA 全部能力经 SDK 构建,本文给 SDK/infra 变化对 YAA 的影响 + 调整计划。
> 关联:[sdk-infra-upgrade-analysis-2026-06.md](./sdk-infra-upgrade-analysis-2026-06.md)、[sdk-requirements-registry-portal.md](./sdk-requirements-registry-portal.md);DVT 消费侧 tracking:YetAnotherAA#311 / #312;SDK gap:aastar-sdk#52;SDK 契约漂移:YetAnotherAA#314。

---

## ⚠️ 更新(2026-06-18):SDK 已到 0.20.x(`@aastar/sdk` 0.20.7)——本节取代下方 0.19 计划

代码已冻结。infra pin 再前进:AirAccount 合约 **v0.19.0-beta.2** / SuperPaymaster **v5.4.0-beta.1-redeploy(2026-06-16)** / KMS openapi **0.23.0** / DVT **v1.3.0**。本次有**两个结构性 break**(CHANGELOG 停在 0.20.1,未记):

### 🔴 头号变化:打包重构 —— 19 个包合并为单一发布包 `@aastar/sdk`
`@aastar/airaccount` / `@aastar/core` / `@aastar/operator`(及其余 16 个)全部 `private:true`,**不再单独发 npm**。YAA 现在的依赖升级后**无法从 registry 解析**,必须全改走 `@aastar/sdk` 子路径:

| 现在 import | 改为 |
|---|---|
| `@aastar/airaccount` | `@aastar/sdk/airaccount`(或根) |
| `@aastar/airaccount/server` | `@aastar/sdk/kms`(无 `/server` 子路径;迁移前先核 `@aastar/sdk/kms` 是否 re-export `YAAAServerClient`/adapters/records/`ServerConfig`/`UserOperation`/`BLSSignatureData`)|
| `@aastar/core` | `@aastar/sdk/core` |
| `@aastar/operator` | `@aastar/sdk/operator` |

涉及 YAA:后端约 9 文件(`@aastar/airaccount/server`)+ 前后端约 9 文件(`@aastar/core`)+ operator/airaccount 各处。

### 🔴 第二变化:ethers→viem 全量迁移 → `ISignerAdapter` 重写(YAA 实现了它,BREAKING)
- `ISignerAdapter`:**删 `getSigner()`**;新增 **`signMessage(userId, message: 0x${string}|Uint8Array, ctx?): Promise<0x${string}>`**;`ensureSigner()` 返回 **`{ address }`**(原 `{ signer, address }`);`getAddress()` 返回 `0x${string}`。
- **`aastar/src/sdk/backend-signer.adapter.ts` 必须重写。** ⚠️ 坑:`signMessage` 传进来的是 **32B 摘要**;底层 `KmsSigner.signMessage` 把 **string 当 UTF-8、Uint8Array 当 raw bytes** → YAA 必须传 **bytes**(`ethers.getBytes(message)`),否则签错 preimage。
- `KmsSigner` 不再是 ethers Signer(删 `signTransaction`/`signTypedData`/`connect`/`provider`);`createKmsSigner` **去掉第 4 个 `provider` 参数** → `aastar/src/kms/kms.service.ts:127` 要去掉那个参数。YAA 不依赖 KmsSigner 的 tx/typed-data 签名(guardian.service 用独立 `ethers.Wallet`),OK。

### 🟡 第三变化:Sepolia 地址全量 redeploy(功能性)
`CANONICAL_ADDRESSES[11155111]` 几乎全换(superPaymaster/paymasterFactory/xPNTsFactory/registry/gToken/policyRegistry/aPNTs + **所有 AirAccount 合约** factory/impl/validator/blsAlgorithm/...)。YAA 若**只**经 `@aastar/sdk/core` 取地址 → 升级自动跟上;但 `@aastar/airaccount` 自带地址副本**仍滞后(beta.4)**,**不要**从那取 AirAccount 地址。审计所有硬编码地址。

### ✅ 好消息:核心调用面没动(现有功能稳)
`client.transfers.*`(executeTransfer/estimateGas/getTransferStatus/getTransferHistory)、`client.accounts.*`、`client.bls.*`(generateBLSSignature/packSignature/getActiveSignerNodes)、`client.tokens.*`、`client.ethereum.*` 签名**全不变**;`IStorageAdapter`+records、`ServerConfig`、`applyConfig`/`CHAIN_SEPOLIA`/`ROLE_*`、`@aastar/core` actions **不变**;`YAAAServerClient`/`YAAAClient` 保留 `@deprecated` 别名仍能编译。

### 修订后"跟随升级保持稳定"硬清单(取代下方 0.19 的依赖部分)
1. **依赖改 `@aastar/sdk@^0.20.7` + 重写所有 import 路径**(上表)。先核 `@aastar/sdk/kms` 导出覆盖 YAA 用的 server 符号。
2. **重写 `backend-signer.adapter.ts`** 到新 `ISignerAdapter`(删 getSigner、加 signMessage 且传 bytes、ensureSigner 返 `{address}`、getAddress 返 `0x`)。
3. **`kms.service.ts:127` 去掉 `createKmsSigner` 第 4 参数**。
4. **地址只经 `@aastar/sdk/core`**;清硬编码(transfer.service PMV4/APNTS + 运营 deploy step + resourceChecker)。
5. 前端 `AirAccountConfig.apiURL` 现**必填**(无默认),`lib/yaaa.ts` 显式传(关联 #314:无公开实例,先用 localhost)。
6. 转账回归(`ALG_ID.BLS` 前缀 + `wrapExecuteUserOp`,0.19 引入)。
7. passkey:client 侧 `PasskeyManager` 路由已可覆盖(#99);server 侧 `@aastar/passkey-server` 尚未交付,等 YAA 提供 RP/KMS-login 实现抽取(#314)。

> 下方 0.19 章节保留作背景;地址/字段细节以本 0.20.x 节为准。

---

## 0. 一句话结论

SDK 0.19 对 YAA **大部分是叠加兼容**(`@aastar/airaccount/server` 公开 API 只增不删,YAAAServerClient 六子模块结构不变)。但有 **3 个真坑必须先处理**,外加若干语义回归:

1. 🔴 **地址不一致(最高风险,阻塞一切)**:`@aastar/airaccount` 包内置地址仍是 **beta.4**,只有 `@aastar/core` 同步到 v0.18+SP v5.4+PolicyRegistry;而 `@aastar/core` 的 airaccount 地址(factory `0xB14a870e…`)又与 airaccount-contract 仓库 live e2e 集(factory `0x1b694A…`)、SuperPaymaster(tag vs 未提交 redeploy)**三方不一致**。**升级代码前必须先和各仓 owner 核对链上 canonical 地址集。**
2. 🟡 **`IStorageAdapter` 字段变更**:`AccountRecord.salt` 由 `number`→`number|bigint`;新增可选 `dailyLimit` / `guardian1/2(+Sig)`——guardian 账户 initCode 重建依赖,YAA 的 `BackendStorageAdapter` 必须落盘。
3. 🔴 **DVT 大额门限要重写消费路径**(#311/#312):YAA 现在 BLS 走 **legacy 路径**(旧 messagePoint wire),新 DVT 用 `@aastar/core` `dvtWire` + `policyRegistryActions`。

其余:转账 BLS 签名前缀语义变化需回归;KMS 当前 transition 兼容(但 STRICT 将至);`paymasterData` 格式不变(YAA pack 逻辑不动)。

## 1. 版本全景

| 组件 | 新版本 | 说明 |
|------|--------|------|
| aastar-sdk(全包) | **0.19.0**(发布中) | 统一升 0.19,钉下方 infra |
| `@aastar/airaccount` | 0.19.0(npm 已有) | YAA 后端/前端依赖 |
| `@aastar/core` | 0.18→**0.19** | 地址/ABI/dvtWire/policyRegistry 主角 |
| AirAccount 合约 | v0.18.0-beta.1 | (注:链上 live e2e 用的是 CHANGELOG/.env.sepolia 集,非 deployment doc) |
| SuperPaymaster | v5.4.0-beta.1 | x402 拆出、PolicyRegistry、Timelock |
| AirAccount KMS/TA | v0.22.0 | DVT **不在** KMS;challenge-binding STRICT 待翻转 |
| DVT(Validator) | v1.2.0 | DVT v1 发布,wire v1.1.0 冻结 |

## 2. 变化分析(按 YAA 消费面)

### 2.1 🔴 地址来源(P0 阻塞)
- `@aastar/airaccount` 的 `sepoliaV07Config()` / `AIRACCOUNT_ADDRESSES` 默认 = **beta.4**(`packages/airaccount/.../constants/entrypoint.ts`),**未同步**到本次 v0.18。
- `@aastar/core` `CANONICAL_ADDRESSES[11155111]` = v0.18 全量重部署 + SP v5.4 + **新增 PolicyRegistry `0x37e4E40e…`** + aPNTs `0x9f0E11e0…`。
- 但 `@aastar/core` 的 airaccount factory(`0xB14a870e…`)≠ airaccount-contract 仓 live e2e 集(`0x1b694A…`);SuperPaymaster tag(`0xFb090E82…`)≠ 工作树未提交 redeploy(`0x030025f4…`)。
- **YAA 动作**:① 不依赖 `@aastar/airaccount` 内置默认;② 经 `ServerConfig` 显式注入地址;③ **先核对链上实际 canonical 集**(问各仓 owner)再写。删 `transfer.service.ts:22-25` 的 `PMV4_ADDRESS`/`APNTS_TOKEN` 硬编码,aPNTs 运行时读 `SuperPaymaster.APNTS_TOKEN()`(6/20 迁移会变)。

### 2.2 🟡 IStorageAdapter / record(半 breaking)
`@aastar/airaccount/server` 的 `storage-adapter.ts`:`AccountRecord.salt: number → number|bigint`;新增可选 `dailyLimit?: string`、`guardian1?/guardian1Sig?/guardian2?/guardian2Sig?`。YAA 的 `aastar/src/sdk/backend-storage.adapter.ts` 要:支持 salt bigint 序列化;持久化 guardian/dailyLimit 字段(`TransferManager`/`createAccountWithDefaults` 依赖)。

### 2.3 🟡 转账签名语义(回归)
`TransferManager`:BLS 账户签名前缀统一为 `ALG_ID.BLS`(0x01)拼接;`ExecuteTransferParams` 增 `wrapExecuteUserOp?`(默认 false → 老调用兼容)。YAA `transfer.service.ts` 的 `executeTransfer({useAirAccountTiering})` 调用不变,但需**一次转账回归**(Tier1/2/3 仍通、签名形状)。

### 2.4 🟡 KMS(transition 兼容,STRICT 将至)
- 请求/响应形状**不变**,YAA 当前 `signHashWithWebAuthn`/`beginAuthentication` 今天能用。
- 默认 endpoint 改 `kms.aastar.io`(YAA 现用 `kms1.aastar.io`,见 `kms.service.ts:16`/`configuration.ts:79`)→ 统一。
- KMS 类型 PascalCase(`ChallengeId`/`Credential`/`Options`)、`contractScope`/`selectorScope`→string——YAA 经 `KmsManager` 封装,不手搓即不受影响。
- **STRICT 将至**:AirAccount v0.22 定义了 `strict-challenge`(未翻转),翻转后 assertion 必须带 `clientDataJSON` 且 `challenge=SHA-256(nonce‖userOpHash)`。YAA 需在翻转前接 GetChallenge 流程(gated SDK #58)。
- 顺手:0.19 暴露了 `KmsHttpClient`,可去掉 `kms.service.ts:31` 的 `(kmsManager as any).http` 私有字段 hack。

### 2.5 🔴 DVT 大额门限(#311 + #312,新功能)
- **#312 PolicyRegistry 读**:`@aastar/core` 新增 `policyRegistryActions(addr)(client).checkPolicy({sender,target,asset,amount,selector}) → {decision: ALLOW|REQUIRE_DVT|REJECT, remainingDaily}`(地址 `0x37e4E40e…`)。正合 YAA 把 `useAirAccountTiering` 配置阈值改为读链上策略。**但链上 enforcement 还没 wire**:SuperPaymaster impl 暂未调 PolicyRegistry(层1/off-chain 强制),airaccount-contract 的 sender-keyed staked consumer 在**未合并分支**(#110)。→ YAA 现阶段只能"读策略 + 客户端强制",验证期链上强制等 #110 合并。
- **#311 客户端聚合通道**:YAA 现在 BLS 走 **legacy 路径**(`@aastar/airaccount` `BLSSignatureService`,旧 messagePoint+字符串 nodeIds wire)。新 DVT 用 `@aastar/core` `crypto/dvtWire.ts`:`encodeDVTAccountSignature({tier, p256, nodeIds, blsSig, guardianSig?})`(T2=0x04 / T3=0x05,显式 bytes32 nodeIds 列表,**不传 messagePoint**)+ `BLSSigner.aggregateSignatures`。**节点 HTTP 收集 SDK 未发布复用客户端**——YAA 要自己实现 client→node(`POST /signature/sign` + `ownerAuth`=owner 对 userOpHash 的 EIP-191,否则节点 403),参考 Validator `docs/design/dvt-node-protocol.md` + SDK `dvt-realnode-e2e.ts`。这是 #311 实际工作量。
  - 注:account-level handleOps 签名 = `[nodeIdsLen][nodeIds(N×32)][blsSig256]`(YAA 关心的这层);verifier/slash 层才是 `(signerMask, sigG2)`。

### 2.6 🟢/⚠️ community 包
功能 bug 已修(`issueXPNTs` 改真函数、`configureSBTRules`/`getCommunityStats` 实现),但**发布缺 dist 的根因(tsconfig 缺 `noEmit:false`)未修**——能 import 仅因磁盘留旧 dist。YAA 运营门户用 `@aastar/core`、未直接 import community,**不阻塞**;若将来要用,需上游补 tsconfig(修法在 aastar-sdk#52)。

### 2.7 🟢 paymasterData / x402
`paymasterData` 偏移格式**不变**(YAA pack 逻辑不动)。x402 结算从 SuperPaymaster 抽成独立 `X402Facilitator`(SP 的 break)——**YAA 不用 x402,无影响**。

## 3. YAA 调整计划(分优先级)

### P0 — 阻塞/前置
- **P0-1 地址 canonicalization**(其它一切的前置):与各仓 owner 核对 Sepolia canonical 集(airaccount factory/impl/validator/blsAlgorithm、SP proxy、PolicyRegistry、aPNTs);确认后 `ServerConfig` 显式注入;删 `transfer.service.ts` 硬编码 PMV4/APNTS + `scripts/update-superpaymaster-price.js`;aPNTs 运行时读 `SP.APNTS_TOKEN()`。
- **P0-2 升级依赖**:前后端 `@aastar/core ^0.18→^0.19`(`@aastar/airaccount` 已 ^0.19),`@aastar/operator` 同步 0.19;`npm run build`/`type-check` 全绿。
- **P0-3 IStorageAdapter**:`backend-storage.adapter.ts` 支持 `salt: bigint`;持久化 `dailyLimit`/`guardian1/2(+Sig)`。

### P1 — 兼容/卫生
- **P1-1 转账回归**:验证 Tier1/2/3 + 新 `ALG_ID.BLS` 前缀 + `wrapExecuteUserOp` 默认路径。
- **P1-2 KMS**:endpoint 统一 `kms.aastar.io`;去掉 `(kmsManager as any).http`,改用 `KmsHttpClient`;为 STRICT 预备 GetChallenge 流程(gated SDK #58)。
- **P1-3 EntryPoint 版本现实对齐**:默认 0.6→0.7(账户合约仅 v0.7);清 v0.6/v0.8 死配置;修 `detectAccountVersion` 桩。

### P2 — DVT 功能(gated,已建 tracking issue)
- **P2-1 (#312)** transfer 金额分级 → 读 `policyRegistryActions().checkPolicy()`;gated on 地址定(P0-1)+ 链上 enforcement(#110 合并)。
- **P2-2 (#311)** DVT 客户端聚合通道:实现 client→node HTTP(ownerAuth)+ `dvtWire.encodeDVTAccountSignature` 组装;gated on SDK 是否发布复用节点客户端(否则 YAA 自建)。

### 持续
- 推动 community republish(上游 aastar-sdk#52);YAA 领"DVT 价值验证消费者"(端到端:节点部分签→聚合→YAA 提交→链上验通)。

## 4. 风险与阻塞
1. **地址三方不一致**(P0-1)——最大风险,代码动不了直到地址定。
2. **PolicyRegistry 链上 enforcement 未 wire**(#110 未合并)→ P2-1 现阶段只能读+客户端强制。
3. **DVT 节点 HTTP 客户端 SDK 未发布**→ P2-2 YAA 自建。
4. **KMS STRICT 翻转时间**未定(gated SDK #58)。

## 5. 建议执行顺序
`P0-1 地址核对(问 owner,阻塞)` → `P0-2 升级 + P0-3 adapter` → `P1 回归/KMS/EntryPoint` → `P2 DVT(等 enforcement + 节点客户端)`。P0/P1 是纯 YAA 本仓可执行;P2 gated 在生产方。

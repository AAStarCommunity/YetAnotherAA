# YAA Serverless 迁移路线图（两阶段）

> 状态：草案，供拆分讨论
> 日期：2026-06-18
> 关联：SDK `@aastar/sdk@0.20.8`（单包，100% viem）；DVT program hub `YetAnotherAA-Validator#42`（已 CLOSED）；本仓 tracking #311 / #312
> 前置事实见 `docs/sdk-0.19-dvt-upgrade-analysis-2026-06.md`

---

## 背景与目标

YAA 当前是「NestJS 后端（`aastar/`，:3000）+ Next.js 前端（`aastar-frontend/`，:5173）」的全栈应用。
经核实，**钥匙在 KMS、canonical 状态在链上合约**——后端既不是钥匙库也不是账本，它只是中间一层「让 email + 生物识别 + gasless 这套 UX 能跑」的胶水。

**两阶段目标：**

1. **阶段一（稳定）**：把 YAA 同步到最新 SDK `@aastar/sdk@0.20.x`，现有功能链路全部跑通、CI 全绿。**不改任何业务功能。**
2. **阶段二（瘦身）**：分级拆除后端，把它的职责分别迁到 KMS / 客户端 / 无状态 proxy / 公共 indexer，终态是一个可部署到 Cloudflare Pages 的静态前端 + 极薄基础设施。与「DVT 独立性命门」「客户端化/静态化偏好」对齐。

执行原则（用户明确）：
- **慎重、一块一块 check**：替换升级 → 局部测试 → 确认 OK → 再做完整链路测试。
- **分别提 PR**，不要一个大 PR。
- 只在 YAA 仓库改代码；对外部仓库（SDK/KMS/DVT）只提 issue。

---

## 后端职责盘点（拆解依据）

后端 5 类职责（均经代码核实）：

| 级别 | 职责 | 代码/实体落点 | 是否「钥匙/账本」 |
|---|---|---|---|
| ① | **身份/会话**：`email → walletAddress → kmsKeyId` 映射 + JWT 会话 | `entities/user.entity.ts`、`auth/` | 否（映射/会话） |
| ② | **链下索引/缓存**：转账历史、用户代币/NFT 列表、地址簿、paymaster 偏好、BLS 节点缓存、guardian/recovery 记录 | `entities/{transfer,user-token,user-nft,bls-config,guardian,recovery-request}.entity.ts` | 否（便利数据） |
| ③ | **ERC-4337 签名编排**：组 UserOp → 分级签名（P256+BLS+guardian）→ 收 BLS 节点签 → 拼 paymaster → 提 bundler → 轮询 | `transfer/transfer.service.ts`、`bls/bls.service.ts` | 否，但=**CA 中间人** |
| ④ | **密钥/凭据代理**：`BUNDLER_RPC_URL`(Pimlico key)、`ETH_RPC_URL`、`KMS_API_KEY`、`USER_ENCRYPTION_KEY`、`JWT_SECRET` | `app-config/`、`.env` | 是（藏密钥） |
| ⑤ | **门户只读聚合**：admin/operator/community/sale dashboard 聚合链上读 | `{admin,operator,community,registry,sale}/` | 否（只读） |

**WebAuthn RP 不在此列**：passkey 的 challenge 签发 + 断言验证 = **KMS（`kms.aastar.io`）**，YAA 全程是 KMS RP 的客户端。详见 #314 结论。

### ⚠️ 拆 server 前必须先清的雷
`User` 实体含 `encryptedPrivateKey` + `mnemonic` 两列（KMS 之前的 legacy 本地私钥路径）。
**阶段二开工前**必须确认 prod 完全不走它并清理——否则「客户端化」会把这条私钥路径暴露到浏览器，是严重安全面。

---

## 阶段一：跟随 SDK 0.20.x，现有功能稳定

### 已核实的事实地基
- SDK = 单包 **`@aastar/sdk@0.20.8`**，**ethers 完全移除（100% viem）**。
- server 符号（`YAAAServerClient`/`KmsManager`/`ISignerAdapter`/`IStorageAdapter`/`createKmsSigner`）canonical 全在 **`@aastar/sdk/kms`**；`@aastar/sdk/airaccount` 是 `@deprecated` alias（只保留一个版本）。
- 旧包 `@aastar/core@0.18.0`、`@aastar/airaccount@0.19.0` **仍在 npm** → 可 staged 分 PR（lockfile 同时容纳新旧）。
- YAA import 面：后端 16× `@aastar/airaccount/server` + 4 `core` + 1 `airaccount`；前端 9 `core` + 1 `operator` + 1 `airaccount/server` + 1 `airaccount`。
- 新 `ISignerAdapter`：仅 `getAddress(userId)` / `signMessage(userId, message: 0x|Uint8Array, ctx?)`（EIP-191，传 32-byte digest 原始字节）/ `ensureSigner(userId): {address}`。**删 `getSigner`、无 provider。**

### 子任务（分别提 PR，每个 PR 自身 build + 局部测试绿，最后做完整链路测试）

| PR | 范围 | 关键改动 | 局部验证 | 风险 |
|---|---|---|---|---|
| **P1-A** | **后端依赖+import 迁移** | `@aastar/airaccount`+`@aastar/core` → `@aastar/sdk@^0.20.8`；`airaccount/server`→`@aastar/sdk/kms`、`core`→`@aastar/sdk/core`；root lockfile 用 `npm install` 重生成 | `npm run build -w aastar`、`npm test -w aastar`、`type-check` | 中（前端此 PR 仍用旧包，lockfile 双持） |
| **P1-B** | **重写 `backend-signer.adapter.ts`** | ethers→viem：删 `getSigner`；加 `signMessage(userId, bytes\|0x, ctx)`（核实 KmsSigner 的 EIP-191 raw-bytes 语义）；`ensureSigner`→`{address}`；`getAddress` 返回 `0x${string}` | 后端 build + 针对 adapter 的单测；用一笔已知 userOpHash 验签名可被 `recoverAddress` 还原 | 🔴 高（签名语义，错了转账断） |
| **P1-C** | **`kms.service.ts` 去 ethers** | `createKmsSigner` 去第 4 参（provider）；删 `ethers.Provider` 类型 | 后端 build + KMS 登录单测 | 中 |
| **P1-D** | **前端依赖+import 迁移** | `@aastar/core`/`operator`/`airaccount/server` → `@aastar/sdk/*`；删旧包；lockfile 收敛 | `npm run build -w aastar-frontend`、`type-check` | 低 |
| **P1-E** | **地址 re-sync + 清硬编码** | `transfer.service.ts:22-25` 硬编码 v4 `PMV4_ADDRESS`/`APNTS_TOKEN` → 经 `@aastar/sdk/core` / 运行时读链；`scripts/update-superpaymaster-price.js` 同步 | Sepolia 上一笔真实转账（支付敏感，单独测） | 🔴 高（支付路径） |
| **(gate)** | **完整链路回归** | 非 PR，是合并门：register → KMS passkey login → create account → transfer Tier1/2/3 → operator 门户读 | 端到端跑通 + CI 全绿 | — |

> P1-B 可并进 P1-A（后端不重写 adapter 无法编译），也可拆开先让 P1-A 用临时桩过编译再 P1-B 实装——执行时按「先编译绿、再语义对」决定。P1-E 因支付敏感**务必独立 PR**。

---

## 阶段二：分级拆除后端（5 个阶段，逐级 PR）

按**风险与依赖**排序，每个阶段保持 app 可用、后端逐步变薄。每阶段 = 一个（或一簇）PR，独立讨论清楚再开发。

### 阶段 2.1 —— ④密钥代理 + ⑤门户只读（最低风险，本仓可独立做）
- **现状**：后端藏 bundler/RPC key，并聚合链读给 dashboard。
- **方案**：
  - 门户 dashboard 改**前端直接读链**（registry 原 app 即如此；#302 已把写入流程客户端签名，读也可全客户端）。
  - key-bearing 的 RPC/bundler 调用 → 公共端点，或**无状态 Cloudflare Worker proxy**（只转发、无密钥账本、无用户数据、不签名）。
- **落点**：客户端 + 薄 Worker。
- **gating**：无。
- **产出**：后端 admin/operator/community/sale 只读模块可下线一批。

### 阶段 2.2 —— ②链下索引/缓存
- **现状**：DB 存 transfer/token/nft 列表、地址簿等。
- **方案**：
  - 转账历史 → 客户端缓存（IndexedDB），由链读 + bundler receipt 重建；或接公共 indexer/subgraph。
  - 用户代币/NFT 列表、地址簿 → 客户端本地存储 + 可选导出。
- **落点**：客户端 / 只读 indexer。
- **gating**：无（可与 2.1 并行）。

### 阶段 2.3 —— ③签名编排（核心价值，gated）
- **现状**：后端组 UserOp + 签 + 收 BLS + 提 bundler = **CA 中间人**（DVT 独立性命门所指）。
- **方案**：搬进浏览器——SDK viem actions 客户端组 + 签；BLS 走**独立客户端通道**（不经 CA）；bundler 直连（key 由 2.1 的 proxy/公共端点解决）。
- **落点**：客户端 + DVT 节点。
- **gating**：**aastar-sdk#63（BLS 客户端聚合通道）→ 本仓 #311**；金额阈值读链 **SuperPaymaster#283 → 本仓 #312**。
- **备注**：这是 YAA「不再当 CA」的关键一步，价值最高、依赖最重，必须等生产方就绪。

### 阶段 2.4 —— ①身份/会话（最难，最后）
- **现状**：DB `email → wallet → keyId` + JWT 会话。
- **方案**：
  - `email ↔ keyId` 映射**入 KMS**（它本就是 RP，是这份映射的自然归属）。
  - 账户地址从 keyId **counterfactual 派生**，不再依赖 DB 映射。
  - JWT → KMS 签发的客户端持有 token（或无状态方案）。
- **落点**：KMS / 客户端。
- **gating**：需 **KMS 支持 email↔keyId 存储 + 客户端直连鉴权**（给 `AirAccount`/KMS 提 issue）。

### 阶段 2.5 —— 收尾：静态化部署
- Next.js `output: 'export'`（或 Cloudflare adapter）→ 静态前端部署 **Cloudflare Pages**。
- 保留可选的**无状态 proxy Worker**（仅 2.1 的 RPC/bundler 转发）。
- 下线 NestJS 服务。
- **gating**：2.1–2.4 完成。

---

## 终态架构

```
浏览器（静态前端 / Cloudflare Pages）
  ├─ 组+签 UserOp（SDK viem actions，客户端）
  ├─ BLS 独立通道 → DVT 节点（共签）
  ├─ 直连 bundler / RPC（公共端点或无状态 Worker proxy）
  ├─ 直读链（门户/历史/余额）
  └─ passkey ceremony → KMS（RP：challenge + 验断言 + 签）

KMS（kms.aastar.io）       = WebAuthn RP + 钥匙 + email↔keyId 映射
链上合约                    = canonical 状态（账户/paymaster/PolicyRegistry）
DVT 节点                    = 门限 BLS 共签
（可选）无状态 Worker        = RPC/bundler 转发，无密钥账本、无用户数据
（可选）公共 indexer/subgraph = 历史查询
```

后端不可省的内核 → 趋近于零；最大、最敏感的「签名编排」迁到客户端后，YAA 不再是 CA 式中间人。

---

## 排序逻辑小结

1. **阶段一**先把地基换成 0.20.x 并稳住，不动功能。
2. **阶段二**先做低信任、本仓能独立完成的（2.1 密钥/门户、2.2 缓存）→ 再做高价值但 gated 的 2.3 编排 → 身份 2.4 最硬放最后 → 2.5 静态化收尾。
3. 每步保持 app 可用，后端逐步变薄，而非一次性重写。

---

## 待办/依赖清单

- [ ] 阶段一 P1-A…P1-E 分别开 PR + 完整链路回归（执行中）
- [ ] 确认并清理 `User.encryptedPrivateKey/mnemonic` legacy 私钥路径（阶段二前置）
- [ ] 给 KMS/AirAccount 提 issue：email↔keyId 存储 + 客户端直连鉴权（阶段 2.4 gate）
- [ ] #311（BLS 客户端通道，gated aastar-sdk#63）、#312（PolicyRegistry 阈值读链，gated SuperPaymaster#283）—— 阶段 2.3 落点

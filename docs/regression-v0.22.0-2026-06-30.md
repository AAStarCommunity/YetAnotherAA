# YAA Tier-2/3 device-passkey 回归报告 — v0.22.0 / SDK 0.30.0(2026-06-30,链上真实)

## 版本与依赖(已升最新)
| 组件 | 版本 | 说明 |
|---|---|---|
| 合约 | **v0.22.0** | passkey-at-birth:工厂部署时自动接 validator + 写 owner p256Key |
| `@aastar/sdk` | **0.30.0** | device-passkey Tier-2/3 prepare/submit + v0.22.0 factory wrapper(已 bump:package.json×2 + lockfile) |
| viem | 2.43.3 | SDK 内 pin |
| DVT 节点 | dvt1/2/3.aastar.io | 链上 registered |
| KMS | kms.aastar.io | healthy, ta_mode real, v0.27.3 |

## 合约 v0.22.0 Sepolia 地址(SDK CANONICAL_ADDRESSES,无硬编码)
- Factory `0x0eb0E7a61d5D9e03bc3578f8C1b0d9f40cc0a5B9`
- Impl `0x1cE314101E218D28bb6c6D16d6C259A4a1E67578`
- Extension `0xF736C229fE6f0cb9C864A4298E2755b7a0A19691`
- Validator Router `0xfcDfd17a373E037c3F9C8ffE2c781915E7Ae6e11`

## 1. 后端测试套件 ✅
`npm test -w aastar` → **6 套件 / 41 测试全过**(5.5s)。

## 2. 类型检查 ✅
`type-check` backend + frontend(0.30.0)→ **0 错**(无 3-参 getAddress 踩雷;ox 0.14.7 类型重定向在)。

## 3. 链上 Tier-3 WebAuthn 复合签名回归(v0.22.0,真实 Sepolia)✅
`node scripts/test/onchain/tier3-composite.mjs`(仅用已发布 `@aastar/sdk` packers 组装复合签名):

| 项 | 结果 |
|---|---|
| 账户(passkey 绑定 salt) | `0xEb4Ce8401Acc72373aA0a5156164B11F5F881b23` |
| 部署 tx | `0xf3606f757e2e8be79c52287dbcfe22687879c985982a4d3ad3811368c7256418` (success) |
| **validator @birth** | `0xfcDfd17a373E037c3F9C8ffE2c781915E7Ae6e11` ✅ 工厂 immutable 自动接好(无 setValidator tx) |
| **p256KeyX @birth** | == 传入 passkey ✅(无 setP256Key tx) |
| DVT 聚合 | dvt1/2/3 registered,≥2/3 BLS 聚合 |
| 复合签名 | 902 字节(algId 0x0a) |
| **`validateUserOp(0x0a)` Tier-3** | **== 0 ✅ ACCEPTED**(链上 WebAuthn 重建 + EIP-7212 P256VERIFY + DVT BLS + guardian)|
| **`validateUserOp(0x09)` Tier-2** | **== 0 ✅ ACCEPTED**(passkey + DVT BLS,无 guardian;837B;同账户同时 approve 0x09+0x0a)|
| 负向(篡改 challenge) | ✅ rejected |

最新一跑账户 `0x080C1d8b2965c0796fAF69c54F52B33237aC4765`、deploy tx `0x0b08a2a4a2d34aec11129004fd2887e84a91d5dca458f4d808579c055a7b68c8`。

→ **passkey-at-birth + Tier-2 + Tier-3 cumulative 复合签名机制,在 v0.22.0/0.30.0 新栈上链上确认无误。**
> Tier-1 = 内联 P256(algId 0x03 / COMBINED_T1 0x06),非 cumulative router 路径,无独立 packer;属基础 passkey 路径,与 T2/T3 复合是两套机制。

## 已实现的业务流程
- 账户出生即配 validator + 设备 passkey(一次 tx,无后置引导)— **EOA owner / direct mode 已链上验证**
- 设备 passkey(P256)+ DVT BLS 聚合 + guardian ECDSA 三因子复合 → 链上 ACCEPTED
- 两阶段转账封装(prepare → 浏览器 passkey challenge=userOpHash → submit,SDK 内部打包,零手工)
- Paymaster gasless、KMS 托管 owner、tiered 安全(T1 P256 / T2 +BLS / T3 +guardian)

## ⚠️ 唯一未闭环:KMS 托管账户的 passkey-at-birth 创建(relay mode)
- v0.22.0 的 passkey-at-birth E2E 用 **EOA owner(direct mode,msg.sender==owner)** 验证通过。
- YAA 生产 owner 是 **KMS TEE**(发不了 raw tx)→ 必须 **relay mode**(KMS EIP-191 签 CREATE_ACCOUNT digest + deployer 代发)。
- 但 SDK 0.30.0 **没封装** relay 创建:高层 `createAccountWithP256Guardians` 不收 ownerP256X/Y;低层 `createAccount` 的 ownerSig 是不透明入参、无 digest helper;digest 需的 `_getConfigHash` 是合约 internal pure。
- **已提独立诉求**:aastar-sdk#249(`createAccountWithPasskey(userId,…,{deployerWallet})`)+ airaccount-contract#155(暴露 public digest view)。决策:**等 SDK 封装,不手搓安全 digest**。
- 影响:真实 KMS 用户从前端"注册→建账户→转账"的端到端,**待 #249 落地**才能跑完。机制本身已全验。

## 结论
机制层(passkey-at-birth、Tier-3 复合、DVT、gasless)**链上真实验证通过**;唯一缺口是 KMS-relay 账户创建的 SDK 封装(#249),非机制问题。

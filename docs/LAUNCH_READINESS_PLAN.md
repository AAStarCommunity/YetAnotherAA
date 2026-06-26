# YAA 上线前剩余测试覆盖计划

> 现状：核心**正向**路径已在 Sepolia 验证（转账全链路、Tokens 买入、注册/passkey、API 鉴权、社区/运营者读流程、运营者准入前半段=注册社区+部署 xPNTs、后端单测 34/34）。
> 本文档列出**上线前必须补齐**的 5 块，含分工、顺序、逐条用例。
> 顺序约定：1–3 + 5 先做，**4（主网冒烟）最后做**（全部测试通过 + 发布前）。

## 分工 / 顺序总表

| # | 项 | 负责 | 何时 | 状态 |
|---|---|---|---|---|
| 1 | Guard 写（严格模式/每日限额）真机复现 | 用户 | 现在 | 📄 文档就绪 `docs/test-manual/GRD-04-guard-write.md` |
| 2 | 运营者准入后半段（Paymaster V4 部署 + EntryPoint 充值）+ 查 Step5 revert | Claude | 1 之后 | ⬜ |
| 3 | 修 `operator/status` 500（hasRole(undefined)） | Claude | 并行 | ⬜ |
| 4 | 主网关键路径冒烟（转账 + gasless 买入） | Claude | **最后** | ⬜ |
| 5 | 逆向/异常 + 未覆盖域 | Claude | 1–3 之后 | ⬜（计划见下） |

---

## 步骤 2 — 运营者准入后半段

`operator-onboarding.spec.ts` 现停在 Step5（Paymaster 步）。补全 Step5–7：

1. **查 Step5 revert**：一次运行 Step5「Deploy & register Paymaster V4」显示 Retry。先 `simulateContract` 复刻 `deployAndRegisterPaymasterV4`（含 ROLE_PAYMASTER_AOA 30 GT stake）解码 revert 原因——区分：GToken 不足 / 工厂地址 / 角色前置 / SDK 入口。
2. 修因后扩测试：Step5 部署 Paymaster → Step6 EntryPoint 充值（已填 0.01）→ StepComplete「Onboarding complete」。
3. 资源：新 EOA 现有 17.39 ETH + 468 GToken + GToken owner（能 mint），足够多轮非幂等 run。
4. 断言：完成后链上验证 paymaster 已部署 + ROLE_PAYMASTER_AOA 已注册 + EntryPoint deposit > 0。

## 步骤 3 — 修 operator/status 500

S2 e2e 发现 `GET operator/status` 在未注册/缺参时 `hasRole(undefined)` → 500。
1. 定位 `aastar/src/operator/*` 里 status 处理，对 address/role 缺失做 guard，返回 200 + 空状态而非抛错。
2. 补 e2e：未注册用户调 operator/status → 期望 200 + `{registered:false}`（而非 500）。

## 步骤 4 — 主网冒烟（最后做）

> ⚠️ 真实资金。仅在 1–3 + 5 全绿后、发布前做，小额。
1. 关键路径各一笔：**gasless 转账**（passkey ceremony）、**gasless 买入 aPNTs**。
2. 用独立的主网测试账户 + 最小金额；记录 tx 到 `docs/test-evidence/mainnet/`。
3. 验证：UserOp 上链、余额变化、Paymaster 代付生效。

---

## 步骤 5 — 逆向 / 异常用例矩阵（核心补强）

> 原则：每条都断言**失败被正确拒绝/报错**，而非静默通过。L1=链上脚本，L2=API，L3=Playwright。

### D1 转账 / Guard
| 用例 | 期望 | 型 | 优先 |
|---|---|---|---|
| 余额不足转账 | 提交前/链上拒绝，余额不变 | L3 | 高 |
| 金额 = 0 / 负 / 超精度 | 表单或后端拒绝 | L2/L3 | 中 |
| 收款地址非法（非 checksum/零地址） | 拒绝 | L2 | 中 |
| 单笔超每日限额（guard）| **强制 Tier 3**（passkey+BLS+guardian ECDSA），缺签名则拒绝 | L3 | 高 |
| 严格模式开启后受限操作 | 被 guard 拦截 | L3 | 高 |
| passkey 断言被拒/取消 | UserOp 不提交 | L3 | 高 |
| 重放同一已用 challenge / nonce | 拒绝 | L1/L2 | 高 |
| 过期 prepare（commitChallenge 超时） | 拒绝 | L2 | 中 |

### D2 Tokens 买入
| 用例 | 期望 | 型 | 优先 |
|---|---|---|---|
| 滑点超限 | revert（已有 TOK-06 ✓） | L1 | — |
| USDC 余额/授权不足 | 买入前拒绝 | L1/L3 | 高 |
| EIP-3009 授权过期/重放 | 拒绝 | L1 | 高 |
| 错误链买入（链不匹配） | 拒绝/切链提示 | L3 | 中 |

### D3 Auth
| 用例 | 期望 | 型 | 优先 |
|---|---|---|---|
| 错误 OTP / 过期 OTP | 拒绝，不发 token | L2 | 高 |
| 重复注册同邮箱 | 幂等/拒绝，不串号 | L2 | 中 |
| 无效/过期 JWT 访问受保护接口 | 401 | L2 | 高 |
| OTP 暴力尝试限速 | 限流 | L2 | 中 |

### D4 运营者 / 社区
| 用例 | 期望 | 型 | 优先 |
|---|---|---|---|
| stake 不足注册角色 | revert | L1 | 高 |
| 重复注册同角色 | `RoleAlreadyGranted` | L1 | 中 |
| 非 owner 改角色/社区 | revert | L1 | 高 |
| 资源预检不达标（GToken/ETH 不足）| 向导拦在资源步 | L3 | 中 |

### D5 Paymaster 管理
| 用例 | 期望 | 型 | 优先 |
|---|---|---|---|
| Paymaster 充值不足时代付 | bundler 拒绝 / 优雅失败 | L2 | 高 |
| 不支持的代币付 gas | 拒绝 | L2 | 中 |

### D6 账户 / EntryPoint 版本
| 用例 | 期望 | 型 | 优先 |
|---|---|---|---|
| 未配置的 EntryPoint 版本（如 v0.6）建账户 | 明确报错（非裸 500） | L2 | 中 |
| 重复建账户 | 幂等返回已有账户 | L2 | 中 |

### 未覆盖域（需新建用例）
| 域 | 内容 | 优先 |
|---|---|---|
| **Guardian / 社会恢复** | 添加/移除 guardian、阈值恢复、恢复重放拒绝、非 guardian 越权 | 高 |
| **多 EntryPoint 版本** | v0.7/v0.8 各跑一遍转账（现仅 v0.7 验证） | 中 |
| **KMS 边界** | KMS 不可达/超时的降级与报错 | 中 |
| **BLS signer 网络** | 节点离线/签名聚合失败时的处理 | 中 |

---

## 完成定义（可以说"核心没问题可上线"）
- [ ] 1 Guard 真机复现通过（或定位为真 bug 并修）
- [ ] 2 运营者准入完整跑通（含 Paymaster 部署 + 充值 + complete）
- [ ] 3 operator/status 500 修复 + 回归
- [ ] 5 高优先逆向用例全绿（D1 转账/Guard、D2 授权重放、D3 JWT、D4 权限、Guardian 恢复）
- [ ] 4 主网关键路径冒烟通过
- [ ] 代码库密钥扫描干净（含历史卫生收尾）
- [ ] 6 分层签名（Tier 1/2/3）按设计触发 + Tier-3 guardian 协签可用（见下）
- [ ] 7 带外确认（高额交易）端到端可用：bot ping → passkey 批准（方案2）
- [ ] 8 浏览器 bundle 无 KMS/AES 泄漏（tree-shaking 或 node-only 兜底）

---

## 6. 分层安全签名 + 带外确认 + 联系方式绑定

> 详细设计与分支表见 `docs/TIERED_SECURITY_PAYMENT_FLOWS.md`（业务视角）；SDK 封装诉求见 aastar-sdk#176；带外确认/绑定跨仓库设计见 aastar-sdk#193。

**关键修正（contract-as-truth）**：超 guard **日限额 = 硬 block**（不是 guardian 升级）；判档看**累积消费**；账户 tier 阈值两个创建函数都不初始化 → 必须 `createAccountWithDefaults` + 创建后 `setTierLimits/setWeightConfig`（按画像 preset），否则分层形同虚设（实测超额转账缺签名 revert 的根因）。

**带外确认（方案2，YAA 已背书）**：高额交易 → DVT 扣留 + 共享 bot **ping（深链回 YAA）** → 用户在批准屏做 **passkey ceremony 签 userOpHash**（复用现有转账 ceremony，非输 token）→ DVT 验签补签。

**联系方式绑定**：绑定页（TG 一键深链/二维码 + email 降级）+ onboarding 接入 + 设置页管理；依赖 SDK `startContactBinding/confirmContactBinding/getContact`。

## 7. SDK / DVT / 合约 依赖追踪

| 场景（YAA 要建） | 依赖 | 追踪 | 状态 |
|---|---|---|---|
| 类型可用（升级基线） | /core 的 .d.ts | aastar-sdk#189 | ✅ 0.26.15 修复，YAA 已升 |
| 画像页 + 转账判路 UI | `resolveTransfer/TIER_PROFILES` browser-safe | #195 / 0.26.16 | ⏳ 待发；或 YAA 后端封装出 REST（不等） |
| 放宽限额 + Tier-3 guardian 协签 | 合约 `tierLimitNonce()` + SDK 建 MODIFY_TIER_LIMITS digest + guardian 收集 | airaccount-contract **#132（合约 getter ✅ 838 tests 过）** → aastar-sdk#188（SDK 接 readContract+encode） | 🔵 合约就绪，SDK 进行中 |
| 带外确认轮询/批准凭证 | `/signature/confirm` 凭证格式（方案2）+ SDK approve 助手 | Validator#124 + #193 | ⏳ 待 DVT 回 |
| 绑定页 | `startContactBinding/confirmContactBinding/getContact` | #193 + YetAnotherAA#378 | ⏳ 跨仓库收敛（YAA 已回 + 背书方案2） |
| 浏览器 bundle 卫生 | CryptoUtil → node-only 子路径 | #190/#195 | ⏳ 已验证建议做（见 §8） |

## 8. 浏览器 bundle 卫生（tree-shaking 验证）

实测（0.26.15）：YAA 前端 bundle 2 个 chunk 含 `aes-256-gcm` + `scrypt`。源 = `lib/yaaa.ts` import `@aastar/sdk/kms` 的 `KmsManager`（register/login/guardian-sign 三页，仅用 WebAuthn 方法 begin/complete/poll/signHashWithWebAuthn，不用对称加密）→ CryptoUtil 是**死重量**。
建议（已发 SDK）：CryptoUtil → **node-only 子路径**（物理隔离，比单靠 tree-shaking 确定）；0.26.16 落地后**重跑 bundle 扫描**确认无 `aes-256-gcm/scrypt`。

> 本计划与 `docs/TIERED_SECURITY_PAYMENT_FLOWS.md` 配套：后者是分层安全业务流程与分支表，本文是上线总 checklist + 依赖追踪。

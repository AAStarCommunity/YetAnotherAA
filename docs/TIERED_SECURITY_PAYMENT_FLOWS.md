# 分层安全与支付流程（Tiered Security & Payment Flows）

> 业务视角文档：在 YAA 应用场景下，**不同配置的用户**如何被分层签名 + DVT 策略 + 带外确认正确兼容。
> 依据：实读 `airaccount-contract`（账户/工厂/storage）+ `YetAnotherAA-Validator`（DVT signer）源码。
> SDK 侧诉求见 [AAStarCommunity/aastar-sdk#176](https://github.com/AAStarCommunity/aastar-sdk/issues/176)（本文是 YAA 业务规划，#176 是对 SDK 的封装要求，两者配套）。

---

## 0. 一句话原则

> **YAA 不自己判分层、不自己 check 策略——全部经 SDK 的 `resolveTransfer` 拿到"该走哪条分支/收哪些签名/要不要带外确认"，按结果驱动 UI；权威校验在链上合约 + DVT 节点服务端。**

---

## 1. 安全模型三层（缺一不可）

| 层 | 在哪 | 管什么 | 谁校验 |
|---|---|---|---|
| **账户分层签名（Tier）** | 账户合约 `AAStarAirAccountV7` | 按金额/权重要求 passkey / +BLS / +guardian | 链上 `validateUserOp` |
| **Guard 花费限额** | guard 合约 | ETH 日限额 + 每个 ERC20 token 限额 | 链上 guard |
| **DVT 节点策略 + 带外确认** | DVT signer 服务（链下）+ 链上 `IPolicyRegistry` | 独立于 owner 的策略闸 + 高额二次确认 | **DVT 节点服务端** |

### 权重模型（账户分层的底层）
- 权重：passkey=3、owner ECDSA=2、DVT-BLS=2、每个 guardian=1。
- 档阈值（最小累计权重）：**tier1=3、tier2=5、tier3=6**。
- 达到的档 = 累计签名权重满足的最高阈值。
- 特权阈值：40=仅 owner，**70=owner+1 guardian（默认）**，**100=owner+2 guardian**。

---

## 2. ⚠️ 创建账户时的配置真相（必须改）

| 项 | `createAccount`（自由版，YAA 疑似在用） | `createAccountWithDefaults`（带 default） |
|---|---|---|
| guardians | 无 | 强制 2 个 + 默认社区 guardian |
| guard 日限额 | 无 guard | 必填（>0），minDailyLimit=10% |
| 默认算法 | 无 | 8 种（含 Cumulative-T2/T3/Weighted） |
| ERC20 token 限额 | 无 | 工厂默认 token 配置 |
| **账户 tier 金额阈值 / 权重阈值** | **0（未配）** | **InitConfig 不含 → 仍需另设** |

**结论**：两个创建函数都**不初始化账户的 tier 金额阈值/权重阈值**。`requiredTier` 会恒返回 0、加权路径会 `WeightConfigNotInitialized` revert。
**YAA 必做**：① 改用 `createAccountWithDefaults`；② 创建后**补一笔 `setTierLimits` + `setWeightConfig`**（按所选用户画像 preset）。否则分层永远是关的——这正是实测"超日限额转账只收 passkey → 链上缺签名 revert"的根因。

---

## 3. 完整签名分支表（一笔支付走哪条）

| 触发条件 | 需达档 | 需要的签名 | DVT 链下闸门 | 不满足结果 |
|---|---|---|---|---|
| 金额 ≤ tier1Limit | T1（≥3） | **passkey(3)** | owner-auth | — |
| tier1Limit < 金额 ≤ tier2Limit | T2（≥5） | passkey + **DVT-BLS(2)** | + policy | 缺 BLS → 链上权重不足 revert |
| 金额 > tier2Limit **或超 guard 日限额** | T3（≥6） | passkey + BLS + **1 个 guardian(1)** | + **带外确认（高额）** | 缺 guardian → revert |
| 收款人不在 allowlist | 与档无关 | 同上 | **policy 拒签 403** | DVT 不签，不上链 |
| 单笔超节点 perTxMax | — | 同上 | **policy 拒签 403** | 同上 |
| 账户链上策略不允许 | — | 同上 | **policy L1 拒签**（治理门控） | 同上 |
| 高额（ETH ≥ 阈值） | 按金额 | 同档 | **带外确认**：扣留→独立通道批准（10min） | `pending_confirmation`，未签 |
| 改限额 / 高权限模块 | 特权阈值 | owner + **1 或 2 guardian** | — | 缺 guardian 签名 |

**1 个 vs 2 个 guardian**：
- **1 个**：普通 T3 转账（passkey 3 + BLS 2 + guardian 1 = 6）；默认特权阈值 70（owner+1）。
- **2 个**：高权限操作（特权阈值 100，如模块安装绕过）、改限额/恢复的法定数，或 BLS 不可用时凑权重。

---

## 4. ETH 与 ERC20：统一一套，阈值来源不同

| | ETH（默认资产） | ERC20 / 任意自定义 token |
|---|---|---|
| tier 额度来源 | 账户 `requiredTier(amount)`（tier1Limit/tier2Limit） | guard `tokenConfigs[token]` = `{tier1Limit, tier2Limit, dailyLimit}`（**每币种独立、每账户不同**） |
| 日限额 | guard `dailyLimit` / `todaySpent` | guard `tokenDailySpent[token]` |
| 签名分支 | 见第 3 节 | **完全相同**（passkey / +BLS / +guardian） |

**业务要求**：YAA 的判路必须**同时覆盖 ETH 和所选 token**——同一个 `resolveTransfer({account, token, amount})` 返回该 token 的分支。**现状前端只看 ETH `account.dailyLimit`，完全没读 ERC20 tokenConfigs → ERC20 的 T3 会静默 revert，必须修。**

---

## 5. 带外确认（Out-of-band Confirmation）——业务怎么走

- **触发**：ETH 金额 ≥ DVT 节点 `CONFIRM_THRESHOLD_WEI`（节点 `CONFIRM_ENABLED` 开启时）。
- **行为**：DVT **扣留不签**，返回 `pending_confirmation`；用户经**独立通道**（邮件等，非应用本身）批准；TTL 10 分钟。
- **防什么**：owner key/passkey 被盗后的**大额盗转**——盗号者拿不到独立通道的批准。
- **YAA 业务流**：
  1. `resolveTransfer` 返回 `needsOutOfBandConfirm: true` → 提交后收到 `pending_confirmation`；
  2. UI 进入"等待独立通道确认"态，引导用户去邮箱/独立渠道批准；
  3. 轮询/回调 SDK 的确认状态 API；确认后才真正上链；超时（10min）则失败重来。
- **SDK 诉求**：暴露 `pending_confirmation` 状态 + 确认轮询/回调 API（#176 补3 第 5 条）。

---

## 6. Allowlist：在哪设、谁 check、何时 check、初始化还是随时管理（定论）

| 问题 | 答案 |
|---|---|
| **在哪设置** | **两层**：① Layer-2 = **DVT 节点运营者的 env** `POLICY_RECIPIENT_ALLOWLIST`（+ `POLICY_PER_TX_MAX_WEI`）；② Layer-1 = **链上 `IPolicyRegistry`**（SuperPaymaster 注册表，**每账户**，治理门控）。**都不在账户 InitConfig 里。** |
| **是否初始化账户时填** | **否**。Layer-2 是节点静态配置；Layer-1 是链上 policy，**随时可管理**（账户 owner 改），但**治理门控**（有延迟，防盗号瞬间放宽）。 |
| **何时 check** | **DVT 节点在签名请求时**（`policyService.evaluate`），**签名之前**。owner-auth 通过后才到策略闸。 |
| **谁 check** | **DVT 节点服务端权威校验**（不是 YAA，也不是用户）。空 allowlist = 放行任意收款人。Layer-2 拒 → 403；Layer-1 拒 → checkPolicy 否决。 |
| **YAA 该怎么做** | **不自己 check**。① 提交前用 SDK `resolveTransfer().dvt.policyWillPass` **预查询**，提前给用户提示（"该收款人不在白名单/超策略"）；② 提交后**处理 403/拒签**，给清晰文案；③ **绝不**把策略判断逻辑搬到前端。 |

---

## 7. 用户画像（preset）兼容策略

合约只有单一 `_buildDefaultConfig`，**画像分层在 SDK 层封装**（#176 补2/补3）。YAA 业务流：
1. 注册后展示画像选择：**web3 新手 / 有经验交易员 / 保守型**（各对应不同 tier1Limit/tier2Limit/dailyLimit/权重）。
2. 加载 preset → 用户可微调 → 点"同意"。
3. 带着该配置走 `createAccountWithDefaults` + 创建后补 `setTierLimits/setWeightConfig`。
4. 之后用户可在设置页调整（受治理门控约束）。

---

## 8. YAA 落地清单（依赖 SDK #176）

- [ ] 改用 `createAccountWithDefaults` 建账户 + 创建后补 tier/weight 配置（按 preset）
- [ ] 接 `resolveTransfer({account, token, amount})` 判路（ETH + ERC20 统一），UI 按返回的 `requiredSigs` 收集签名
- [ ] T2 自动取 DVT-BLS；T3 收集 guardian 协签并组装进 UserOp.signature
- [ ] 提交门禁（fail-fast）：签名/确认未齐前不提交，不烧 gas
- [ ] 带外确认：`pending_confirmation` 态 + 独立通道引导 + 状态轮询
- [ ] Allowlist：提交前 `policyWillPass` 预查询提示 + 处理 403
- [ ] 画像 preset 选择页 + 设置页调整（治理门控）

> 以上 SDK 侧诉求已全部留言在 **#176**（补1：API+协签+fail-fast；补2：createAccountWithDefaults+preset+DVT 策略；补3：完整分支表+resolveTransfer+带外确认+ERC20 统一）。

---

## 9. Policy / Guard 管理界面（扩展现有 /guard 页）

用户必须能自助管理自己账户的限额与策略，否则配置无从设置。**入口 = 扩展 `/guard` 成 policy 管理页。**

### 9.1 哪些是"用户能管的"，哪些不是（关键区分）
| 配置 | 归属 | 用户能管？ | 管理方式 |
|---|---|---|---|
| **ERC20 token 限额**（tier1/tier2/daily per token） | 用户账户的 guard | ✅ 能 | `GuardClient.encodeAddTokenConfig` → 经两段式 passkey UserOp 提交 |
| ETH 日限额（**只能降**） | guard | ✅ 能 | `encodeDecreaseDailyLimit`（升额需 guardian，见下） |
| 严格模式 | guard | ✅ 能（已在 /guard） | `encodeSetStrictMode` |
| 账户 tier 金额阈值（tier1Limit/tier2Limit） | 账户 | ✅ 能 | `setTierLimits`（GuardClient 暂无 encoder，YAA 直接 encode 或求 SDK 补） |
| **Layer-1 收款 allowlist / per-asset 策略** | 链上 `IPolicyRegistry`（per-account，治理门控） | ✅ 能（**这才是用户的 allowlist**） | `policyRegistryActions` |
| **Layer-2 收款 allowlist / perTxMax** | **DVT 节点运营者 env** | ❌ **不能**（不是用户的，是运营者的） | 不在 YAA 管理界面 |

> ⚠️ 用户说的"设置自己的 allowlist"= **Layer-1 链上 per-account policy**（`policyRegistryActions`），不是 Layer-2 节点 env。管理界面只管 Layer-1。

### 9.2 现在能建 vs 受 guardian 流程阻塞
- **现在可建（Tier-1，passkey 即可——都是"收紧"操作）**：加 ERC20 token 限额、**降低**日限额、开严格模式、读所有现状（getConfig/getTokenConfig/getTokenTodaySpent）。
- **受阻（"放宽"操作需 guardian 协签，与 #176 同一阻塞）**：升高日限额/tier 限额（`modifyTierLimitsWithGuardians`）、放宽 Layer-1 策略。SDK 给协签 API 后再接。

### 9.3 管理页要素
1. **ERC20 token 管理**：列出已配 token（合约地址 + tier1/tier2/日限额 + 今日已花）；"添加 token"表单（合约地址 + 三个限额）→ `encodeAddTokenConfig`。
2. **ETH 限额**：显示日限额/已花/剩余；降额入口。
3. **tier 阈值**：显示/调整 tier1Limit/tier2Limit（受治理门控）。
4. **Layer-1 收款策略**：增删允许的收款人/资产/上限（`policyRegistryActions`，治理门控延迟提示）。
5. **严格模式**：开关（已有）。
6. 所有"放宽"操作标注"需 guardian 协签"，未就绪前禁用并提示。

### 9.4 对 SDK 的补充诉求（并入 #176）
- 补 `setTierLimits` / `modifyTierLimitsWithGuardians` 的 encoder + guardian 协签收集。
- `policyRegistryActions` 的读/写封装 + 治理门控状态（pending/生效时间）查询。
- 统一"管理操作 → 所需签名档"的判定（哪些 Tier-1 可直接做、哪些需 guardian）。

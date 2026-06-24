# YetAnotherAA (Cos72) — 测试用例与测试方案

> 目标：把整套 Cos72 业务（个人用户 + 社区管理员/用户 + 运营者 + 协议）按**领域 / 角色 / 路径**拆成可执行用例，正向/逆向/异常全覆盖；**自动化为主（Playwright + Chrome DevTools Protocol + viem 链上脚本 + Jest e2e）、手工为辅**；每条涉及链上的用例必须留下**真实可查的凭证**（tx hash / 合约地址 / SBT id / UserOpHash），**测试网（Sepolia）跑通 → 主网（Ethereum / OP）按同一用例复跑**后才算上线。

- 维护者：jason ｜ 适用分支：`master`
- 关联：菜单见 `components/Layout.tsx`；后端 17 个 controller；前端 29 路由。
- 当前阶段：**Sepolia 测试网**为主；主网（chainId 1 / 10）的 sale/DVT/Guard 栈未全部部署 → 标记 `mainnet: 待栈就绪`。

---

## 0. 测试方法与工具（自动化优先级从高到低）

| 层 | 工具 | 覆盖 | 能否自动化 passkey/钱包 |
|---|---|---|---|
| **L1 链上脚本** | **viem 脚本**（node，持测试 EOA 私钥） | 买币/转账/Guard 写/质押等纯链上路径，直接签名+提交+断言+记 tx | ✅ 完全（本地私钥签名，无需浏览器） |
| **L2 API e2e** | **Jest + AppModule + fetch**（已有 `aastar/test/`） | 后端路由：鉴权守卫、prepare/submit、presets、community/list 等 | ✅ 完全 |
| **L3 浏览器 E2E** | **Playwright + CDP `WebAuthn` 虚拟认证器** | 登录/注册/转账/Guard 等真实 UI 流；passkey 用 CDP 虚拟认证器自动完成 ceremony | ✅ passkey 可（CDP 虚拟认证器）；MetaMask 用注入式测试钱包（见 §6） |
| **L4 手工** | 真机 + 真 MetaMask + 真 Face ID/iCloud | 真实设备 passkey 跨设备同步、MetaMask 弹窗 UX、视觉/暗色/i18n、主网真实资金 | ❌ 必须人工 |

**原则**：能进 L1/L2/L3 的不放 L4。passkey **不是**手工理由——CDP 的 `WebAuthn.addVirtualAuthenticator` 可在自动化里完成 P-256 ceremony。真正必须 L4 的：真实设备/iCloud 同步验证、MetaMask 原生弹窗、人眼视觉验收、主网真金。

### 凭证要求（每条链上用例必须留）
执行后写入 **证据台账** `docs/test-evidence/<domain>-<caseId>.json`：
```json
{ "caseId":"TOK-01","network":"sepolia","actor":"0x…","txHash":"0x…",
  "explorer":"https://sepolia.etherscan.io/tx/0x…","artifacts":{"aPNTsReceived":"50"},
  "blockNumber":11121168,"status":"success","runAt":"<ISO>","by":"auto|manual" }
```
无 tx hash / 无可查凭证的链上用例 **不算通过**。

---

## 1. 环境与前置

| 项 | 值 |
|---|---|
| 测试网 | Sepolia (11155111) — sale/DVT/Guard/Paymaster 全部署 |
| 主网 | Ethereum (1) / OP (10) — `待栈就绪`，栈部署后同用例复跑 |
| 后端 | `cd aastar && KMS_DIAG=true npm run start:dev`（:3000，/api/v1） |
| 前端 | `npm run dev -w aastar-frontend`（:5173） |
| 地址来源 | **全部经 `@aastar/sdk`**（canonical / launch-sale / DVT）——用例断言地址时以 SDK 为准，禁硬编码 |
| 测试 EOA | 一个持 Sepolia ETH + USDC + GToken/aPNTs 的私钥（L1 脚本用；当前已验证 `0xb56000…0E` 有 283 USDC） |
| 测试邮箱 | OTP 注册用；KMS key 用后**勿删**（删了登录 400） |

---

## 2. 领域 / 角色总览

```
个人用户 (Individual)         社区 (Community)                 运营/协议 (Operator/Protocol)
├─ D1 注册与账户              ├─ D6 社区管理员                 ├─ D8 运营者(Gas赞助)
├─ D2 Tokens/门票             │   创建/发币/Gas策略/日常管理     │   PaymasterV4 / SuperPaymaster / xPNTs
├─ D3 Guard 消费守卫          ├─ D7 社区用户(加入/退出/广场)    ├─ D9 Role / SBT
├─ D4 Transfer               │                                ├─ D12 Protocol Admin
├─ D5 社交恢复               D10 NFT(商品+声誉)  D11 Tasks      X 跨领域(i18n/鉴权/网络/暗色/异常)
```
角色：`访客` / `个人用户` / `社区管理员` / `运营者` / `Guardian` / `协议管理员`。

---

## 3. 用例表（按领域；类型 = ✅正向 / ⛔逆向 / ⚠️异常）

> 列：ID ｜ 角色 ｜ 类型 ｜ 路径/步骤 ｜ 预期 ｜ 方法 ｜ 凭证

### D1 个人注册与账户（/auth/register, /auth/login, /dashboard, account.*）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| AUTH-01 | 访客 | ✅ | 注册：填 email → 收 OTP → 验证 | 进入 passkey 注册步骤；JWT 暂存 | L3(Playwright) | — |
| AUTH-02 | 访客 | ✅ | 注册 passkey（创建 AirAccount，KMS key + P-256 凭证） | 返回反事实账户地址；DB 落 user(kmsKeyId/walletAddress) | L3(CDP 虚拟认证器) | accountAddress |
| AUTH-03 | 个人 | ✅ | 部署合约账户（首笔 UserOp / create-with-…guardians） | 账户上链；guard 合约同时部署(若 dailyLimit>0) | L1(viem)/L3 | 部署 txHash + guard 地址 |
| AUTH-04 | 个人 | ✅ | 登录：email + passkey 断言 → /dashboard | 登录成功，停留 dashboard（不回跳首页） | L3(CDP) | — |
| AUTH-05 | 访客 | ⛔ | 用未注册 email 登录 | 优雅降级到 OTP/提示，不白屏 | L3 | — |
| AUTH-06 | 访客 | ⛔ | OTP 错误码 / 过期码 | 明确错误提示，不放行 | L2/L3 | — |
| AUTH-07 | 个人 | ⚠️ | KMS key 被删后登录 | `/SignHash`/begin 400 → 提示"重新注册/恢复"，不静默失败 | L3 + 手工 | KMS 400 响应 |
| AUTH-08 | 访客 | ⛔ | 设备无 passkey / 用户取消 ceremony | NotAllowedError → 提示，可回退 | L3(CDP 模拟取消) | — |
| AUTH-09 | 个人 | ✅ | Account info 管理（查看地址/余额/nonce/signer） | 正确显示；rotate-signer 可用 | L2/L3 | — |
| AUTH-10 | 访客 | ⛔ | 未登录访问 `/dashboard` 等受保护页 | 重定向 `/auth/login`（前端 + 后端 401） | L2(已有 e2e)/L3 | 401 |

### D2 Tokens / 门票（/tokens, tokens/sale/user-token）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| TOK-01 | 个人 | ✅ | Gasless 买 aPNTs（USDC，EIP-3009 → DVT relay 代付） | relayer 上链 success；aPNTs 到账；买家无需 ETH | **L1(已验证)** | txHash `0x49040263…` + dvt2 代付 |
| TOK-02 | 个人 | ✅ | Gasless 买 GToken | 同上，GToken 到账 | L1 | txHash |
| TOK-03 | 个人 | ✅ | Self-pay 买（USDC，approve+buyTokens，自付 ETH gas） | 2 笔 tx 上链；token 到账 | L1/L3 | approve+buy txHash |
| TOK-04 | 个人 | ✅ | Self-pay 买（USDT） | 同上（USDT 不走 EIP-3009） | L1 | txHash |
| TOK-05 | 个人 | ✅ | 网络切换 Sepolia→OP→ETH | 要求 MetaMask 切链；非 Sepolia 买入禁用 + "sale 未上线"提示 | L3(测试钱包) | — |
| TOK-06 | 个人 | ⚠️ | 滑点：minOut=quoted×98% | 价格劣于 floor 时 revert，不被夹 | L1(构造滑点) | revert 凭证 |
| TOK-07 | 个人 | ⛔ | aPNTs self-pay 传 minOut | SDK 拒（#147）→ 我们 UI 已对 aPNTs self-pay 省略 minOut，不报错 | L1/L3 | — |
| TOK-08 | 个人 | ⚠️ | 金额过小（quote=0） | 拦截"金额太小"，不发交易 | L3 | — |
| TOK-09 | 个人 | ⛔ | gasless 收款人填非法地址 | `isAddress` 拦截，不提交 | L3 | — |
| TOK-10 | 个人 | ✅ | gasless 默认收款人 = 用户 AirAccount | 买到的 token 进 AirAccount | L1 | recipient=AirAccount 的 txHash |
| TOK-11 | 个人 | ✅ | 质押 GToken → 换取 ticket(SBT) | 获得 SBT(ticket)；可加入社区 | L1/L3 | stake txHash + SBT id |
| TOK-12 | 个人 | ✅ | DVT relay 连通性徽章 | 显示 N/N 在线（checkDvtConnectivity） | L3 | — |
| TOK-13 | 个人 | ⚠️ | DVT relay 全挂时 gasless | 兜底到 legacy worker 或明确失败提示 | L1(指向挂的 relay) | — |

### D3 Guard 消费守卫（/guard, GuardClient + transfer 两阶段）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| GRD-01 | 个人 | ✅ | 查看 Guard：getConfig（ETH 限额/剩余/已用/下限/严格模式） | 正确渲染 | L1/L3 | — |
| GRD-02 | 个人 | ✅ | 按 token 查 getTokenConfig + 今日消费 | 正确（按 decimals） | L1/L3 | — |
| GRD-03 | 个人 | ✅ | 降 ETH 每日限额（经账户 UserOp） | 限额降低；链上 config 更新 | L1/L3(CDP) | UserOpHash + 新 config |
| GRD-04 | 个人 | ✅ | 开/关严格模式 | strictMode 翻转 | L1/L3 | txHash |
| GRD-05 | 个人 | ✅ | 加 token 配置（tier1/2/daily，add-only） | 新增配置 | L1/L3 | txHash |
| GRD-06 | 个人 | ✅ | 降某 token 每日限额 | 降低 | L1/L3 | txHash |
| GRD-07 | 个人 | ⛔ | 试图调高限额 / 改已存在 token 配置 | 合约 revert（单调）；UI 也应预先拦 | L1 | revert |
| GRD-08 | 个人 | ⛔ | 降到低于 minDailyLimit | revert / UI 拦 | L1/L3 | — |
| GRD-09 | 个人 | ⚠️ | 无 guard 的纯 agent 账户（guard()==0） | 显示"无守卫"，管理隐藏 | L3 | — |
| GRD-10 | 个人 | ⚠️ | 严格模式下转未配置 token | 转账被 guard 拒 | L1 | revert |

### D4 Transfer（/transfer, transfer 两阶段 ceremony）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| XFER-01 | 个人 | ✅ | Tier-2 转账（prepare → 设备 passkey ceremony → submit） | `/SignHash` 200 + 上链 success | **L1/L3(CDP)** | tx `0xb390ef59…`(已验证) |
| XFER-02 | 个人 | ✅ | Tier-1 小额（单 P-256） | 上链 success | L1/L3 | txHash |
| XFER-03 | 个人 | ✅ | Tier-3 大额（+guardian ECDSA） | 上链 success | L1/手工 | txHash |
| XFER-04 | 个人 | ✅ | gasless（usePaymaster + PaymasterV4，aPNTs 付 gas） | 账户无 ETH 也成功 | L1/L3 | txHash + paymaster |
| XFER-05 | 个人 | ⚠️ | prepare 后 >10min 才 submit（句柄过期） | 提示重新 prepare | L3 | — |
| XFER-06 | 个人 | ⚠️ | 余额不足 / Guard 限额超 | 明确失败，不静默 | L1/L3 | — |
| XFER-07 | 个人 | ⛔ | legacy 裸 passkey 路径 | 被 KMS strict 拒（已弃用） | L1 | 400 |
| XFER-08 | 个人 | ✅ | 转账历史 /transfer/history | 列表正确含 txHash 链接 | L2/L3 | — |

### D5 社交恢复 / Guardian（/recovery, /guardian-sign, guardian.*）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| REC-01 | 个人 | ✅ | 创建账户时加 2 个 guardian（2-of-3，存不同 provider） | 两 guardian 登记成功 | L3(CDP×2)/手工 | guardian 公钥 |
| REC-02 | Guardian | ✅ | guardian-sign：已有 AirAccount passkey 渠道签名 | 产出有效断言 | L3(CDP) | — |
| REC-03 | Guardian | ✅ | guardian-sign：新建 email+FaceID（KMS ECDSA）渠道 | 同上 | L3 | — |
| REC-04 | Guardian | ✅ | guardian-sign：MetaMask 渠道 | personal_sign 有效 | L3(测试钱包) | — |
| REC-05 | Guardian | ✅ | **纯客户端 P-256 passkey 渠道**（无 KMS，iCloud/Google） | 产 P-256 断言；后端 encodeWebAuthnAssertion relay proposeRecoveryWithSig 上链 | L3(CDP)/手工 | recovery txHash |
| REC-06 | 个人 | ✅ | 发起恢复 → guardian 支持 → 执行（换 owner） | owner 更新；guard 不受影响（account immutable） | L1/L3 | initiate/support/execute txHash |
| REC-07 | 个人 | ⛔ | 不足门限 guardian 支持就执行 | revert | L1 | — |
| REC-08 | 个人 | ⚠️ | 取消恢复 / 恢复时限 | 状态正确 | L1/L3 | — |

### D6 社区 — 管理员（/community, /operator, community/registry/operator/paymaster.*）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| COM-A-01 | 社区管理员 | ✅ | 买 GToken（创建社区前置） | GToken 到账 | L1 | txHash |
| COM-A-02 | 社区管理员 | ✅ | 注册社区：质押 + registerCommunity + ENS/域名/描述/logo(IPFS) | 社区上链；registry 可查 | L1/L3(测试钱包) | community 地址 + tx |
| COM-A-03 | 社区管理员 | ✅ | 创建即发行社区积分 xPNTs（deployxPNTs + 绑定） | xPNTs 合约部署；与社区绑定 | L1/L3 | xPNTs 地址 + tx |
| COM-A-04 | 社区管理员 | ✅ | Gas 策略 A：自部署 PaymasterV4（免费、自维护） | 部署向导跑通；EntryPoint depositTo | L3(operator/deploy)/手工 | paymaster 地址 + deposit tx |
| COM-A-05 | 社区管理员 | ✅ | Gas 策略 B：SuperPaymaster（把 points 注册即可） | points 注册到 SuperPaymaster；可代付 | L1/L3 | 注册 tx |
| COM-A-06 | 社区管理员 | ✅ | 日常：架设积分兑换台（redeem counter） | 兑换台可用 | L3/手工 | tx |
| COM-A-07 | 社区管理员 | ✅ | 日常：发行 NFT 商品 | NFT 商品上架 | L3/手工 | mint tx |
| COM-A-08 | 社区管理员 | ✅ | 日常：发行 reputation NFT（声誉，不可转让 SBT 性质） | 声誉 NFT 发行 | L1/L3 | mint tx |
| COM-A-09 | 社区管理员 | ✅ | 成员管理：查看/批准/移除成员 | 成员状态正确 | L2/L3 | — |
| COM-A-10 | 社区管理员 | ⛔ | 无 GToken/未质押就注册社区 | 前置检查拦截 | L1/L3 | — |
| COM-A-11 | 社区管理员 | ⚠️ | xPNTs 重复绑定 / 域名冲突 | 明确拒绝 | L1/L3 | — |

### D7 社区 — 用户（/community 广场, /role, SBT）

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| COM-U-01 | 个人 | ✅ | 购 ticket：质押 GToken 换 ticket → 领 SBT | 持有 SBT | L1 | stake + SBT mint tx + SBT id |
| COM-U-02 | 个人 | ✅ | 社区广场：聚合展示所有社区（名称/ENS/token/owner/logo） | 列表正确（含官方 AAStar + Mycelium） | L2(community/list)/L3 | — |
| COM-U-03 | 个人 | ✅ | 持 SBT 加入社区 | 成为社区成员 | L1/L3 | join tx |
| COM-U-04 | 个人 | ✅ | 退出社区 | 成员关系解除 | L1/L3 | leave tx |
| COM-U-05 | 个人 | ⛔ | 无 SBT 试图加入社区 | 拒绝（需先购 ticket） | L1/L3 | — |
| COM-U-06 | 个人 | ⚠️ | 加入已退出/不存在的社区 | 明确错误 | L2/L3 | — |

### D8 协议运营者 / Gas 赞助节点（/operator, /operator/deploy, /operator/manage/*）

> **D6 社区管理员 vs D8 协议运营者 —— 区别**：D6 是**社区**视角（创建社区、发 xPNTs、为本社区选 Gas 策略）；D8 是**生态/协议运营者**视角——在 SuperPaymaster 生态里**注册运营者角色（ROLE_ANODE / DVT / Paymaster 等）、质押、运营 Paymaster 节点为他人代付 gas**。一个社区管理员若选"自部署 PaymasterV4"策略，就**同时**扮演 D8 运营者（D6 COM-A-04 与 D8 OPR-01 有重叠，但 D8 还含 AOA+/DVT/SuperPaymaster 运营者准入这些非社区必经的协议级动作）。简言之：**D6=开社区，D8=当协议的 gas 运营者**。这不是协议管理员（那是 D12 `/admin` 协议治理）。

| ID | 角色 | 型 | 步骤 | 预期 | 方法 | 凭证 |
|---|---|---|---|---|---|---|
| OPR-01 | 运营者 | ✅ | 运营者准入向导（流程 1 AOA：stake→register→deployxPNTs→deployPaymaster→deposit） | 全步上链 | L3(测试钱包)/手工 | 各步 txHash |
| OPR-02 | 运营者 | ✅ | AOA+ 准入（lockForSuperPaymaster→registerOperator→depositAPNTs） | 注册成功 | L3/手工 | txHash |
| OPR-03 | 运营者 | ✅ | ManagePaymaster：PaymasterV4 配置读写 + EntryPoint 充值 | 配置生效 | L3 | tx |
| OPR-04 | 运营者 | ✅ | SuperPaymasterConfig：账户状态/aPNTs 充值/声誉 | 正确 | L3 | tx |
| OPR-05 | 运营者 | ✅ | xPNTs 管理（部署/绑定/铸造） | 正确 | L3 | tx |
| OPR-06 | 运营者 | ⚠️ | 资源前置检查（流程 8 checkResources）不足 | 明确阻断 + 指引 | L2/L3 | — |
| OPR-07 | 访客 | ⛔ | 非运营者访问运营写操作 | 权限拒绝 | L2 | — |

### D9 / D10 / D11 / D12

| ID | 角色 | 型 | 步骤 | 预期 | 方法 |
|---|---|---|---|---|---|
| ROLE-01 | 个人 | ✅ | /role 查看自身角色/SBT/权限 | 正确（ROLE_* + SBT） | L2/L3 |
| ROLE-02 | 个人 | ⚠️ | 无角色账户 | 显示"无角色" | L3 |
| NFT-01 | 个人 | ✅ | /nfts 查看持有的 NFT（商品 + 声誉） | 列表正确 | L2/L3 |
| NFT-02 | 个人 | ✅ | verify-ownership / 领取 SBT | 正确 | L1/L2 |
| TASK-01 | 个人 | ✅ | /tasks 创建任务 → 详情 → 状态流转 | 任务队列正确 | L3 |
| TASK-02 | 个人 | ⚠️ | 任务失败/重试 | 状态正确 | L3 |
| ADM-01 | 协议管理员 | ✅ | /admin 协议状态/配置查看 | 正确（chain 11155111） | L2/L3 |
| ADM-02 | 非管理员 | ⛔ | 访问 admin 写操作 | 拒绝 | L2 |
| ADDR-01 | 个人 | ✅ | /address-book 增删查 + 转账后自动记录 | 正确 | L2/L3 |
| RCV-01 | 个人 | ✅ | /receive 展示收款地址/二维码 | 正确 | L3 |
| DT-01 | 个人 | ✅ | /data-tools 数据导出/清理 | 正确 | L2/L3 |

### X 跨领域

| ID | 型 | 步骤 | 预期 | 方法 |
|---|---|---|---|---|
| X-01 | ✅ | 中英文切换（每个页面） | 所有文案随语言切换（含 tokens/guard/transfer/community…），无写死英文 | L3 + `i18n:check` |
| X-02 | ✅ | 暗色/亮色切换 | 全页适配 | L3(视觉)/手工 |
| X-03 | ✅ | 头像菜单 click-outside / Esc 关闭 | 正确 | L3 |
| X-04 | ⚠️ | 后端不可达 / 502 | 前端优雅降级，不白屏 | L3 |
| X-05 | ⚠️ | 钱包未安装 / 拒绝连接 | 明确提示 | L3 |
| X-06 | ✅ | 网络切换全局一致（chainId 贯穿 publicClient/SDK/explorer） | 正确 | L3 |
| X-07 | ⚠️ | 同一操作并发双击（防重复提交） | 按钮禁用，不重复发交易 | L3 |

---

## 4. 自动化测试方案

### 4.1 L1 — viem 链上脚本（`aastar-frontend/scripts/e2e-onchain/` 或 `scripts/test-onchain/`）
- 复用本仓已验证的模式（见 TOK-01 实证）：`privateKeyToAccount` → `createPublicClient/WalletClient` → SDK client（`TokenSaleClient`/`GuardClient`/`transfers`）→ 签名+提交 → `getTransactionReceipt` 断言 `status==='success'` → **写证据台账**。
- 覆盖：TOK-01~04/06/10/11、GRD-03~08/10、XFER-01~04/06、REC-06/07、COM-A-01~03/05/08、COM-U-01/03/04、NFT-02。
- 优点：无浏览器、无 passkey 弹窗、最快最稳；用例即脚本，CI 可跑（用专用测试 EOA + 测试网）。

### 4.2 L2 — Jest API e2e（扩展 `aastar/test/`）
- 已有 `app.e2e-spec.ts`（鉴权守卫 + paymaster presets 地址）。
- 扩展：community/list、operator/status、role、address-book、admin 只读、transfer prepare/submit 鉴权、guardian 列表。
- 断言后端契约 + SDK 集成（地址、社区聚合、权限 401/403）。

### 4.3 L3 — Playwright + CDP 虚拟认证器（新建 `aastar-frontend/e2e/`）
- **passkey 自动化关键**：Playwright `context.newCDPSession(page)` → `WebAuthn.enable` → `WebAuthn.addVirtualAuthenticator({ protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true })`。注册/登录/转账 ceremony 全自动完成，无需真机。
- **MetaMask/EOA**：注入式测试钱包（`window.ethereum` shim，用测试私钥 viem 实现 `request`），或 Synpress；用于 self-pay 买入、运营者写、guardian MetaMask 渠道、网络切换。
- **OTP**：测试环境后端开 `test mode` 固定/可读 OTP（或 mock email），脚本读取。
- 覆盖：AUTH-01~10、TOK-05/08/09/12、GRD-01/02/09、XFER-05/08、REC-01~05、COM-A-04/06/07/09、COM-U-02/05/06、OPR-*、ROLE/NFT/TASK/ADM 的 UI 路径、X-01~07。
- 证据：UI 流触发的链上 tx，从 toast/结果或 `getTransactionReceipt` 抓 txHash 入台账 + Playwright trace/截图归档。

### 4.4 L4 — 手工（清单 `docs/test-evidence/manual-checklist.md`）
- 真实设备 passkey 跨设备 iCloud/Google 同步（REC-01/05）、真 MetaMask 弹窗 UX（TOK-05、OPR-01）、视觉/暗色（X-02）、**主网真金路径**全部、首次部署向导的运营体验。
- 每条手工用例同样回填证据台账（截图 + txHash）。

### 4.5 跑测入口（建议加 npm scripts）
```
npm run test            -w aastar          # L2 单元
npm run test:e2e        -w aastar          # L2 API e2e（已有）
npm run test:onchain    -w aastar-frontend # L1 viem 链上（新增，读测试 EOA + 网络参数）
npm run test:e2e:ui     -w aastar-frontend # L3 Playwright（新增）
```

### 4.6 执行模式 —— 全自动 / 人工介入点 / 分阶段

测试条件齐备（见 `TEST_PREPARATION.md` + `check-prereqs` 全绿）后，按"**能全自动就全自动，到必须人介入处暂停并明确呼叫你**"展开：

| 段 | 能否全自动 | 说明 / 人工介入点 |
|---|---|---|
| **L1 链上脚本** | ✅ **全自动** | 有测试 EOA 私钥 + 余额即可，无人值守跑完，自动记 tx 台账 |
| **L2 API e2e** | ✅ **全自动** | 启后端即可 |
| **L3 浏览器（passkey 经 CDP 虚拟认证器）** | ✅ **可全自动** | 前提：后端开**测试模式可读 OTP**（否则注册卡 OTP，需人工读邮件）；MetaMask 流用注入式测试钱包 |
| **L3 真 MetaMask 弹窗 / 真设备 passkey** | ⛔ **需人工** | 跑到此**自动暂停 + 通知你**："请在 MetaMask 确认 X / 用 Face ID 确认" |
| **L4 主网真金 / 视觉 / 跨设备同步** | ⛔ **需人工** | 全程人工，按清单逐条做 + 回填台账 |

**三种推进方式（你选）**：
1. **全自动批跑**：条件齐 → 一键跑 L1+L2+L3（OTP 测试通道 + 测试钱包就绪）→ 出报告，我只在失败/主网处呼叫你。
2. **半自动（自动 + 人工接力）**：自动跑到 MetaMask 弹窗/真设备处 → 脚本**暂停并打印"请你介入：<具体操作>"** → 你做完回车继续。
3. **分阶段**：一个领域一个领域批准着跑（D1 → D2 → …），每段出小报告你确认再下一段。

**我如何呼叫你介入**：脚本在非自动化点会 `console` 明确打印 `⏸ NEEDS YOU: <操作> (case <ID>)` 并等待（stdin 回车 / 或你在另一个终端完成后告诉我），我据此继续；主网用例则整段标 `MANUAL/MAINNET` 让你按清单做。

---

## 5. 执行流程与上线门禁

1. **Sepolia 全量**：L1+L2+L3 自动跑通 → L4 手工补 → 所有用例证据台账齐全（链上有 tx 可查）。
2. **回归门**：`npm run ci`（format/lint/build/test）全绿 + `i18n:check` 通过 + e2e 全绿。
3. **主网门**（待栈就绪）：同一套用例在 Ethereum/OP 复跑（金额最小化、真金），证据台账标 `network:mainnet`。**测试网 + 主网都跑通**才算该用例"完整完成"。
4. **签收**：每领域负责人在台账签字（caseId + 网络 + txHash + 通过/失败 + by）。

### 证据台账目录
```
docs/test-evidence/
  sepolia/<domain>-<caseId>.json
  mainnet/<domain>-<caseId>.json
  manual-checklist.md
  README.md  # 索引 + 当前通过率
```

---

## 6. 待补 / 风险

- **L3 MetaMask 自动化**：注入式测试钱包 vs Synpress，需选型（建议注入式 viem shim，轻量）。
- **OTP 测试通道**：后端需提供测试模式可读 OTP（否则 L3 注册卡在 OTP）。
- **主网栈**：sale/DVT/Guard/SuperPaymaster 主网未全部署 → 主网用例当前 `blocked`，栈就绪后解锁。
- **测试 EOA 资金**：L1 需持续有测试网 USDC/ETH/GToken；主网需小额真金预算。
- 本文档随菜单/功能演进更新；新功能 PR 必须**同步加用例**（无用例不合并）。

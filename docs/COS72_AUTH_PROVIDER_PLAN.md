# Cos72 登录 Provider 规划

> 状态：规划，未实现。日期：2026-11-13。
> 分支：`docs/cos72-auth-provider`。
> 摸底时的代码：`feat/cc115-b5-sdk-rc2` 的 `c0b4788`（比 `origin/master` 只多这一笔链上只读复核脚本）。工作区当时是干净的。
> 本文先记录仓库现状，再定边界和顺序。登录 Provider 的代码落在 `@aastar/sdk`，本仓库的页面以后只做调用 SDK 的样板。

## 仓库摸底

YetAnotherAA 是 AAstar 的 ERC-4337 全栈应用，不是一套可嵌进别人网站的登录插件。用户用 Passkey（Face ID / Touch ID）登录并确认交易，NestJS 后端编排 UserOperation，远程 BLS 签名网络聚合签名，Paymaster 代付 Gas，用户自己不持有 ETH。

它在 Mycelium 里属于 AAstar 这一层（Web3 基础设施）。对外能力在 Brood 名片里写成「日常加密账户」：指纹登录、免 ETH。Cos72 是社区产品名（`docs/COS72_LANDING_TOUR_PROPOSAL.md`）：会员账号 + 积分 + 兑换 + 声誉。本仓库今天实现的是账户和运营门户，还不是那颗可以插进任意网站的账号插件。

合约和签名节点不在本仓库。Validator 在独立仓库 YetAnotherAA-Validator。BLS 是远程服务。本仓库消费 `@aastar/sdk`，链上地址以 SDK 的 canonical 为准，`.env` 只覆盖。

### 目录和版本

npm workspaces，权威锁文件是根目录 `package-lock.json`。安装用 npm。

| 路径 | 角色 |
|---|---|
| `aastar/` | NestJS 后端，端口 3000，Swagger 在 `/api-docs` |
| `aastar-frontend/` | Next.js 16 App Router。`package.json` 的 dev 脚本是 `next dev -p 5173`。README 仍写 8080，`WEBAUTHN_ORIGIN` 默认也是 `http://localhost:8080` |
| `sdk/` | 仓库内一份很薄的 SDK 源码，运行时依赖的是 npm 上的 `@aastar/sdk` |
| `7702/` | EIP-7702 实验，独立 `node_modules`，不在 workspace 里 |
| `lib/forge-std` | Foundry 库 |
| `docs/` | 演示、测试报告、SDK 升级、上线准备、社交恢复 |

版本没有对齐：根 `package.json` 是 `0.4.0`，`CHANGELOG.md` 停在 `0.7.1`（2026-03-15），后端 `aastar/package.json` 是 `1.0.0`，前端是 `0.1.0`。README 的 Sepolia 演示仍写 `@aastar/sdk@0.34.0`、AirAccount `v0.23.0`。代码两边都是 `@aastar/sdk@^0.43.0`。远程是 `git@github.com:AAStarCommunity/YetAnotherAA.git`。README 徽章仍指向 `fanhousanbu/YetAnotherAA`。

`origin/master` 上已经有的近期修复：Guardian 恢复后按爆炸半径排序数据库写入、`prepareCreateWithPasskey` 的 RPC 链预检、执行恢复前先核对链上 proposal。

### 后端现在怎么接外部

`AppConfigModule` 必须放在 `aastar/src/app.module.ts` 最前面。缺 `JWT_SECRET`、`USER_ENCRYPTION_KEY`（正好 32 字符）、`ETH_RPC_URL`、`BUNDLER_RPC_URL` 会起不来。至少要配一个 EntryPoint（v0.6 / v0.7 / v0.8）。本地可用 `DB_TYPE=json`、`KMS_ENABLED=false`。

业务模块注入 `YAAA_SERVER_CLIENT`（来自 `@aastar/sdk/kms` 的 `AirAccountServerClient`），不自己拼链上调用。`app.module.ts` 里的模块是：Auth、Sdk、Account、Transfer、Bls、Ethereum、Paymaster、Token、UserToken、UserNFT、DataTools、Guardian、Registry、Community、Operator、Admin、Sale。

安全分三档，这是转账签名，不是登录方式：Tier 1 只有 P-256，Tier 2 加 BLS，Tier 3 再加 Guardian ECDSA。

### 前端现在是什么

`/api/*` 反代到本机 3000，`/kms-api/*` 反代到 `https://kms1.aastar.io`。`next.config.ts` 开了 `typescript.ignoreBuildErrors`，构建不因类型错误失败，CI 另跑 `tsc --noEmit`。

用户侧页面：`/auth/login`、`/auth/register`、`/dashboard`、`/transfer`、`/receive`、`/recovery`、`/guardian-sign`、`/tier-setup`、`/tier-raise`。门户侧：`/role`、`/admin`、`/operator`（deploy、manage、node-onboarding、dvt-register）、`/community`、`/paymaster`。状态在 `DashboardContext`、`TaskContext`、`WalletContext`，请求走 `lib/api.ts`。Playwright e2e 覆盖注册、转账、Tier-3、operator、community。

这些页面是产品本身。目标里它们要降成样板：演示一个网站怎样只通过 SDK 嵌进 Cos72。

### 登录现状

控制器是 `aastar/src/auth/auth.controller.ts`，没有密码路由。

| 路由 | 作用 |
|---|---|
| `POST /auth/otp/request`、`/otp/verify` | 邮箱 6 位验证码。第一次见到这个邮箱就创建用户（无密码），返回 JWT，并带 `isNewUser`、`needsWallet` |
| `POST /auth/login/kms/begin`、`/complete` | KMS Passkey 登录，完成后签发 JWT |
| `POST /auth/wallet/link` | 登录后把 KMS 钥匙和地址绑到用户 |
| `GET /auth/profile`、`POST /auth/refresh` | JWT 会话 |

用户表是 `aastar/src/entities/user.entity.ts`：`id`、`email`、`username`、`emailVerified`、`walletAddress`、`kmsKeyId`、`kmsCredentialId`。`passkeys` 表标了 `@deprecated`，凭据改存在 KMS，这张表只兼容旧数据。

仓库里没有 Google 登录，也没有 GitHub 登录，也没有 Better Auth。`aastar/package.json` 有 `bcrypt`、`passport-local`，没有对应的用户密码接口。`about` 和 `privacy` 页面已经写了「不存密码」。`DATA_TOOLS_PASSWORD` 是 `/data-tools` 的管理员门，不是用户密码。

邮箱验证码经 Resend（`@aastar/sdk/email` 的 `ResendMailer`），发件人默认 `hi@aastar.io`。验证码存在进程内的 `Map`，重启即丢。JWT 默认 7 天，由本仓库的 `JWT_SECRET` 签发。这正是以后要从站点侧拿掉的中心化会话：站点继续用自己的会话，Cos72 只证明「这个人是谁」。

### 外部依赖

下面按「跑起来必须有」排列。合约地址抄自 `aastar/env.sepolia.example`（2026-03 的 Sepolia 样例）。运行时以 SDK `getCanonicalAddresses(chainId)` 为准，样例地址会过期。更早的一份清单在 `docs/CONFIG_AND_DEPENDENCIES.md`（2026-07-02），那里把密钥分成「应从应用删掉 / 可由用户换成自己的端点 / 仅开发」。

| 类别 | 依赖 | 默认地址或包 | 谁拿着密钥 | 嵌进网站时 |
|---|---|---|---|---|
| SDK | `@aastar/sdk` | npm `^0.43.0`。后端走 `/kms`、`/core`、`/email`；前端还走 `/operator`、`/tokens`、`/admin`、`/paymaster` | 无 | 站点只装这个 |
| 浏览器 Passkey | `@simplewebauthn/browser` | `^13.3.0` | 设备安全模块 | 由 SDK 带上 |
| 链 | Sepolia RPC | `ETH_RPC_URL` | RPC key | 用 AAStar 默认，或换站点自己的 |
| Bundler | Pimlico | `BUNDLER_RPC_URL` | `PIMLICO_API_KEY` | 同上 |
| KMS | 钥匙与 Passkey 仪式 | `https://kms1.aastar.io` | `KMS_API_KEY` | 默认用 AAStar 的。私钥和凭据不出 KMS |
| BLS / DVT | 聚合签名 | `BLS_SEED_NODES` 样例是 `https://v1.aastar.io`；代码和文档里还出现 `dvt1/2/3.aastar.io`、`yetanotheraa-validator.onrender.com` | 节点自己的密钥 | 登录插件碰不到。转账才碰到 |
| 邮件验证码 | Resend | `RESEND_API_KEY`，`EMAIL_FROM=hi@aastar.io` | API key | 留在 Cos72，站点不发信、不存验证码 |
| 账户合约 | EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 无 | SDK 带地址 |
| 账户工厂 / Validator | AirAccount | 工厂 `0x91E60482a2B343004dF29EB205C4F6916E864700`，validator `0xD9756c11686B59F7DDf39E6360230316710485af` | 无 | SDK 带地址 |
| Gas | SuperPaymaster、Paymaster 工厂、aPNTs | `0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A`、`0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d`、`0xDf669834F04988BcEE0E3B6013B6b867Bd38778d` | Paymaster 存款 | 登录插件碰不到 |
| 注册与治理 | Registry、Staking、GToken、xPNTs Factory、MySBT、价格源 | Registry `0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788`，Staking `0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC`，GToken `0x9ceDeC089921652D050819ca5BE53765fc05aa9E`，xPNTs Factory `0x6EafdA3477F3eec1F848505e1c06dFB5532395b6`，MySBT `0x677423f5Dad98D19cAE8661c36F094289cb6171a`，Chainlink ETH/USD `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 无 | 门户功能才读，登录插件不读 |
| 销售合约 | GTokenSale、aPNTsSale | `0xfb1D40C882aDe3402B41ACc3260FC59a3E18aA9b`、`0x7fcDab5970697B130eA87d0c500dC213f4ba499F` | 仅部署时的部署者私钥 | 登录插件碰不到 |
| 本仓库会话 | NestJS JWT、AES | `JWT_SECRET`、`USER_ENCRYPTION_KEY` | 这台后端 | 目标里从站点消失 |
| 数据库 | JSON 文件或 Postgres | `DB_TYPE`、`DATABASE_URL` | 本仓库 | 站点只留自己的那几列用户字段 |
| 部署 / 恢复中继 | `ETH_PRIVATE_KEY` | 后端代发账户部署和 `executeRecovery` | 服务器私钥 | 目标里换成中继，不进网站。见 `docs/RELAY_SERVICE_PROPOSAL.md` |

CI 门禁是根脚本 `npm run ci`（format、lint、build、test）。`CLAUDE.md` 记了 Security Audit 是已知失败项（上游 NestJS / webpack），其余要过。

### 现状和插件目标的差距

要做的是：本仓库的交互面变成样板，样板全部通过 SDK 集成；任意网站把 Cos72 当成登录插件嵌进去。已有 Better Auth 的站把这条流程嵌进现有会话。新建的站按「装 SDK → 放组件 → 注册或登录」接。

| | 2026-11-13 的仓库 | 目标 |
|---|---|---|
| 页面 | `aastar-frontend` 自己就是产品：钱包、转账、恢复、运营门户都在里面 | 页面降成 demo，只演示别人怎么嵌 |
| 登录 | 上面那几条 Nest 路由，会话是我们签发的 JWT | 站点调用 SDK 里的 `cos72` Provider。Google / GitHub 由 Cos72 在后面接好 |
| Google / GitHub | 没有 | 默认打开，和 Passkey 并列 |
| 密码 | 依赖残留，没有用户密码路由；产品文案已经说不存密码 | 明确删掉，不做开关 |
| 会话 | `JWT_SECRET` 签发，默认 7 天 | 站点继续用自己的会话。Cos72 只交身份 |
| 用户库 | `users` 加账户、转账、NFT、废弃的 `passkeys` | 站点只留「站点用户表」那几列 |
| Better Auth | 未依赖 | SDK 锁定上游一个 commit，在其上加 Provider |
| 恢复 | `docs/social-recovery.md` 已写 2-of-3，前端有 `/recovery` | 登录插件链接过去，不重写 |

留给 AAStar、不对网站暴露的：KMS、BLS/DVT、Paymaster、Bundler、合约地址、邮件发送、部署和恢复用的私钥。放进样板、只通过 SDK 出现的：一个登录/注册按钮、邮箱验证码步骤、恢复入口、一份「表里至少这些列」的说明。

## 决定

用户登录不使用密码。站点数据库不存密码，Cos72 也不存密码。忘记密码这条路不存在，因为根本没有密码。

一个人的登录凭证是下面三样，默认都打开：

1. **Passkey**。这是用户私钥的入口。私钥在 KMS 或账户合约里，打开它的是用户自己的 Passkey。
2. **Google 账户**。
3. **GitHub 账户**。

Passkey 建议放在用户已经在用的同步里：**Google 密码管理器**或 **iCloud 钥匙串**。换手机、重装系统时，由 Google 或 iCloud 把 Passkey 带回来。Cos72 不另做一套「云备份密码」。

恢复用已经写过的 **2-of-3**（见 `docs/social-recovery.md`）：三把里丢一把，剩下两把可以换 signer、把账户迁走。建议的三把是：

| 把 | 放在哪 | 丢了会怎样 |
|---|---|---|
| Passkey A | iCloud 钥匙串 | 仍可用 Google 那把 + 社区多签 |
| Passkey B | Google 密码管理器 | 仍可用 iCloud 那把 + 社区多签 |
| 社区多签 guardian | 链上多签，默认占 3 里的 1 | 单独 1 票到不了门限，不能单独转走账户 |

社区多签只帮恢复，不能单独转走资产。这一点维持 `docs/social-recovery.md` 的不变量，不在登录插件里改。

其他登录方式（密码、再接一家 OAuth）不作为默认。密码不再做开关。本规划之前提过「密码作为额外设置」，这里明确取消。

## 为什么这样切

密码存在应用方的数据库里，泄露面在应用方。用户忘掉就只能走「重置密码」，重置又要回到邮箱或短信，最后还是一个中心化账户。

Passkey 的私钥材料在设备安全模块里，同步交给用户自己的 Google 或 iCloud 账户。应用方拿到的是凭据 ID，不是秘密。丢一把设备，另外两把按 2-of-3 换 signer，账户可以迁，不存在「密码忘了就没了」。

Google 登录和 GitHub 登录是另外两条入口，证明「这是这个 Google / GitHub 账户的主人」。它们和 Passkey 并列，不替代 2-of-3 的资产恢复。

## 站点看到的东西

站点只接一个 Provider，名字定为 `cos72`。站点不自己申请 Google、GitHub 的 OAuth 应用，也不持有 KMS 密钥。Google、GitHub、Passkey 仪式都在 Cos72 这边完成。站点像接入「用 Google 登录」一样接入「用 Cos72 登录」。

同一个入口看这个人有没有账户：

- 没有：按钮是 **注册**。走注册流程（验证身份 → 创建用户 → 登记 Passkey / 绑定 Google 或 GitHub → 需要钱包时再创建账户）。
- 已有：按钮是 **登录**。走对应的 Passkey、Google 或 GitHub。

判断依据是 Cos72 侧已有的用户记录（邮箱、Google subject、GitHub subject、Passkey credential id 任一命中）。站点不自己猜。

邮箱验证码保留，只做一件事：证明这个邮箱属于这个人。它不是密码，也不发会话。Google / GitHub 已经给了已验证邮箱时，跳过验证码。只拿 Passkey 来、又要绑定邮箱时，发一次验证码。

## Better Auth

Better Auth 作为依赖跟踪上游主干，不 fork 整份产品。

- 上游：<https://github.com/better-auth/better-auth>，分支 `main`。
- 锁定方式：SDK 的依赖钉死某一个完整 commit，不跟浮动的 `main`，也不跟浮动的 dist-tag。
- 记录日 2026-11-13 时，`main` 顶端是 `0a014aef61c83a293da224b5d926a0e43253b732`（2026-11-12，`ci: validate docs sidebar icons against versioned docs`）。**真正开工改 SDK 时再确认这个 SHA 仍是要锁的那一笔**，确认后写进 SDK 的 lock 和本文的「当前锁定」一行。
- 更新：定期（建议每季度，或上游有安全修复时）看 `main` 相对锁定点的差异，在 SDK 里把锁定向前移，跑 Provider 的注册/登录测试，通过再改锁定。不在本仓库里改 Better Auth 的源码。

在这个锁定之上，SDK 增加 Provider，而不是改 Better Auth 主干。

站点已经在用 Better Auth 时，插件写进它现有的 `betterAuth({ plugins })`，原来的会话保持不动，多出来的是 `cos72`。站点从零开始时，样板给出同一套插件的最小 `auth.ts`，外加三个组件：`Cos72AuthButton`、注册页、登录页。

Better Auth 文档里的两条路不要混：

| 路线 | 文档 | 我们用不用 |
|---|---|---|
| 站点用别人的 OAuth 登录 | Social providers / Generic OAuth | 站点不直接配 Google、GitHub。这两家由 Cos72 Provider 在后面接 |
| 让别的应用用你的服务登录 | OAuth 2.1 Provider 插件 | 要。Cos72 对站点来说就是这个身份源 |

插件对站点暴露的动作：

- `signInWithCos72()` / `registerWithCos72()`：没有账户走注册，已有账户走登录。也可以是一个 `continueWithCos72()`，由服务端返回 `isNewUser` 决定下一步文案。
- 注册完成前必须落到至少一种凭证：Passkey，或 Google，或 GitHub。三者都没有，注册不算完成。
- 回调给站点的身份：`cos72UserId`、邮箱、`emailVerified`、已绑定的凭证种类。不回调密码，不回调私钥，不回调 Google / GitHub 的 access token。

## 站点用户表

列名可以改，含义必须在。没有这些列，登录态无法和链上账户、恢复绑在一起。

| 含义 | 现在本仓库的字段 | 必须 |
|---|---|---|
| 稳定用户 ID | `users.id` | 是。等于回调里的 `cos72UserId` |
| 邮箱 | `users.email` | 要绑定邮箱时必须有 |
| 邮箱已验证 | `users.emailVerified` | 是。未验证的邮箱不能当找回凭据 |
| KMS 钥匙指针 | `users.kmsKeyId` | 创建过钱包后必须有。站点不存私钥 |
| Passkey 凭据 ID | `users.kmsCredentialId` | 用过 Passkey 后必须有。凭据本体在设备 / KMS，不在站点 |
| 显示名 | `users.username` | 否 |
| 钱包地址 | `users.walletAddress` | 创建账户后要有。登录本身不依赖它 |

不增加密码哈希列。`passkeys` 表已经废弃，新集成不要再建一份 Passkey 公钥仓库；凭据以 KMS 和设备为准。

## 能力放哪

| 仓库 | 拥有 | 不拥有 |
|---|---|---|
| `@aastar/sdk` | Better Auth 锁定、`cos72` Provider、注册/登录流程、Passkey 仪式客户端、对 Google/GitHub 的服务端交换 | 某个网站的业务表 |
| 本仓库 `aastar-frontend` | 样板：空站点如何装 SDK、如何挂插件、按钮在「注册 / 登录」之间怎么变 | 自己的一套登录协议 |
| 本仓库 `aastar`（Nest） | 过渡期仍可跑现有 OTP + KMS 登录，直到样板改走 SDK | 不新增密码登录 |
| KMS、BLS/DVT、Paymaster、Bundler、合约 | 继续由 AAStar 基础设施提供，地址从 SDK canonical 来 | 不进站点仓库 |

本仓库现在的登录已经是无密码的：`POST /api/v1/auth/otp/request`、`/otp/verify`，以及 `POST /login/kms/begin`、`/complete`。依赖里的 `bcrypt`、`passport-local` 没有对应的用户密码路由。实现阶段把这两项从后端依赖去掉，避免以后有人接回密码。`DATA_TOOLS_PASSWORD` 是数据导入导出的管理员门，不是用户密码；是否保留单独决定，不放进这个 Provider。

## 样板里的集成顺序

样板页面按这个顺序讲，也按这个顺序能点通：

1. 安装锁定过的 SDK（SDK 再依赖锁定过的 Better Auth）。
2. 在站点的 `auth.ts` 里加入 `cos72()` 插件。不配置 Google、GitHub 的 client secret。
3. 放上 `Cos72AuthButton`。服务端说没有账户，按钮文案是注册；说已有账户，文案是登录。
4. 注册：邮箱验证码（需要邮箱且不是从 Google/GitHub 带来的）→ Passkey 或 Google 或 GitHub 至少完成一个 → 返回 `cos72UserId`。
5. 站点把自己的用户行写成上一节的那些列，然后用站点原来的会话（Better Auth session 或其他）登录。Cos72 不替换站点自己的会话库。
6. 需要链上账户时再调用现有的 KMS / AirAccount 创建流程。登录完成不等于钱包已创建。
7. 设置页说明：请把 Passkey 同步打开（iCloud 或 Google），并完成 2-of-3 里的第二把。丢一把时走现有恢复页，不走「重置密码」。

## 实现顺序

1. SDK 锁定 Better Auth 的 SHA，加上 `cos72` 插件的空壳和「有账户 / 无账户」探测。
2. 接上现有 Passkey（KMS begin/complete）和邮箱验证码。
3. 接上 Google、GitHub，密钥只放在 Cos72 服务，不出现在样板的 `.env` 说明以外的站点配置里。样板的环境变量只有 Cos72 的发行方 URL 和站点自己的 client id。
4. 本仓库开样板页，按上一节走通注册和再次登录。
5. 删后端未使用的 `bcrypt`、`passport-local`。
6. 恢复仍走现有 guardian 流程，插件只链接过去，不重写 2-of-3。

## 不在这次做

- 不在本分支改登录代码。
- 不把 Better Auth 源码拷进本仓库。
- 不做密码登录，也不做「默认关闭的密码开关」。
- 不把运营门户（registry、operator、sale）塞进登录插件。
- 不改社区多签「1 票不够门限」的规则。

## 当前锁定

| 项 | 值 |
|---|---|
| 上游 | `better-auth/better-auth` `main` |
| 规划记录的候选 SHA | `0a014aef61c83a293da224b5d926a0e43253b732` |
| SDK 是否已经锁定 | 否。开工前再对一次 `main`，然后写入 SDK lock |
| 下次计划核对 | 开工时，以及之后每季度或安全修复时 |

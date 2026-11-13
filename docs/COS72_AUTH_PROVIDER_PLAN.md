# Cos72 登录 Provider 规划

> 状态：规划，未实现。日期：2026-11-13。
> 分支：`docs/cos72-auth-provider`。
> 本文只定边界和顺序。代码落在 `@aastar/sdk`，本仓库的页面以后只做调用 SDK 的样板。

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

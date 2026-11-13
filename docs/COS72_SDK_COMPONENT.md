# Cos72 登录组件：最终结果，以及倒推

> 状态：讨论稿，用来确认结果定义。日期：2026-11-13。
> 分支：`docs/cos72-auth-provider`。
> 配套：依赖锁定见 [COS72_DEPENDENCY_BASELINE.md](./COS72_DEPENDENCY_BASELINE.md)，Better Auth 上的开发任务见 [COS72_BETTER_AUTH_PROVIDER_TASK.md](./COS72_BETTER_AUTH_PROVIDER_TASK.md)，仓库摸底和凭证模型见 [COS72_AUTH_PROVIDER_PLAN.md](./COS72_AUTH_PROVIDER_PLAN.md)。

## 最终结果

正式发布物是 `@aastar/sdk` 的一个子路径（计划叫 `@aastar/sdk/auth`），加上随这个版本一起发布的集成说明。站点安装这个版本，按说明把组件挂进自己的页面，用自己的会话和自己的用户对接。本仓库的前端不再是协议本身，只保留一个按同一份说明装出来的样板，用来证明说明是真的。

站点开发者拿到的是三样东西，缺一不算发布完成：

1. npm 上一个锁定过的 `@aastar/sdk` 版本，其中 `exports` 含 `./auth`。
2. 集成说明：安装、挂到 Better Auth、按钮何时写「注册」、何时写「登录」、回调里有哪些字段。
3. 样板站能按说明走通一次注册和一次再次登录。

组件对站点只做身份证明：这个人是 Cos72 的哪个用户，邮箱是否已验证，绑定了 Passkey、Google 还是 GitHub。私钥、验证码、Google 和 GitHub 的 client secret 不进站点仓库。

登录完成之后，站点还要能打开一块**账户页**。没有这块页面，用户登录了也转不了账、开不了 Gasless、选不了社区的代币。所以发布物是两个一起装的部分，都在 `@aastar/sdk` 里：

| 部分 | 子路径 | 站点怎么用 |
|---|---|---|
| 登录 | `@aastar/sdk/auth` | Better Auth 插件。只负责认出人 |
| 账户页 | `@aastar/sdk/account` 的页面组件 | 登录后挂在站点自己的一个路由上，例如 `/account`。这就是用户的后台 |

账户页不放进 `cos72()` 插件。插件没有页面。页面是另一份导出，读插件已经建立的会话。

## 账户页里有什么

只封装现在这个仓库里**账户持有人**用的能力。导航上 Organizations 那一组（Community 管理、Operator、Protocol、Sale）不是账户，不进这个包。`/data-tools`、营销页、角色选择也不进。

账户页默认要能做这些事。数据从 SDK 读，不从本仓库的 Nest 接口读。否则每个站点都还要部署 YetAnotherAA 后端，封装就没有完成。

| 能力 | 现在落在哪 | 账户页里要看到什么 |
|---|---|---|
| 还没有链上账户 | `CreateAccountDialog`，`POST /account/prepare-create-with-passkey` 与 `submit-create-with-passkey` | 空状态和创建。登录成功不等于已经有钱包 |
| 地址、余额 | `/dashboard`，`GET /account/address`、`/balance` | 账户地址、ETH 余额 |
| 社区代币 | `/tokens`，`GET /token/balances` | 这个站点所属社区的代币余额。代币地址由站点配置传入，不写死成某一个社区 |
| 收款、转账、记录 | `/receive`、`/transfer`、`GET /transfer/history` | 收款码、发起一笔、最近记录 |
| Gasless | `/paymaster`，`GET /paymaster/available`、`/presets` | 当前用哪个 Paymaster、积分够不够付这笔 Gas、这笔交易是否由 Paymaster 付款。这是设置，不是一个没有状态的开关 |
| 额度 | `/tier-setup`、`/tier-raise`、`/guard` | 当前档位和限额。Gasless 转不出去时，页面要说明是档位不够，而不是只显示失败 |
| 恢复 | `/recovery`，guardian 的 prepare / submit | 2-of-3 的状态：三把里丢了一把时从这里迁 signer。沿用 `docs/social-recovery.md` |

地址簿、NFT 列表、任务页可以后加，不是「能用起来」的最低集。你是别人的 guardian 时要去签的 `/guardian-sign`，属于账户能力，但放在恢复流程里，不单独做首页。

站点要传进账户页的配置只有社区这一侧：链、这个社区的代币、这个社区的 Paymaster。不传的话，页面无法知道「用哪个社区的 token」。这些地址仍从 SDK 的 canonical 解析，站点传的是社区 ID 或 SDK 已知道的社区记录，不是自己抄一份 ABI。

## 这样封装时账户侧容易漏的点

- **会话来源。** 账户页使用站点自己的登录态（Better Auth session 里的 `cos72` 账户），不读本仓库今天放在浏览器里的 JWT。
- **页面挂在谁的域名下。** Passkey 的 RP ID 跟页面所在的源绑定。账户页作为组件跑在站点域名上时，注册和以后的签名必须是同一个源。不能登录在 Cos72 的域名、账户页再嵌到另一个域名，否则 Passkey 对不上。
- **创建账户要一笔代发。** 今天后端用 `ETH_PRIVATE_KEY` 把 `submit-create-with-passkey` 送到链上。账户页不能把这把私钥带到站点。创建必须走已经规划的中继（`docs/RELAY_SERVICE_PROPOSAL.md`），否则封装只在「已经有账户」时成立。
- **Gasless 失败要有原因。** 余额为 0、Paymaster 没存款、档位限额、社区代币没授权，是四种不同的空状态。只显示一个「Gasless 设置」开关，用户还是用不了。
- **一个站点一个社区上下文。** 同一个 Cos72 用户可以在不同网站看到不同的社区代币和 Paymaster。账户地址是同一个人的，社区配置是站点的。页面不要假设全球只有一套代币。

## 数据库：哪些站不用改业务表

口头上的假想是「像 Better Auth 那样正常用，站点根本不用改自己的数据库」。这句只对已经在用 Better Auth 的站成立，而且成立方式要说窄。

Better Auth 自己有四张认证表：`user`、`session`、`account`、`verification`。站点原有的业务表（订单、文章、社区成员资料）不在这四张里。

| 站点现状 | 要不要改业务表 | 实际发生的事 |
|---|---|---|
| 已经在用 Better Auth | 不改业务表 | `cos72` 作为它的一个登录方式。关联写进已有的 `account` 表：`providerId = cos72`，`accountId` 是 Cos72 用户 ID。站点用返回的 Better Auth `user` 继续自己的会话 |
| 还没有用户系统，愿意用 Better Auth 管理登录 | 不改「业务表」，因为还没有 | 按 Better Auth 的正常安装创建那四张认证表。Cos72 不再要求站点另加 `kmsKeyId` 这类列 |
| 已有自己的用户表，不用 Better Auth | 要接 | 至少要能存 Cos72 用户 ID，以及邮箱是否已验证。列名自定。这就是 [COS72_AUTH_PROVIDER_PLAN.md](./COS72_AUTH_PROVIDER_PLAN.md) 里那张「站点用户表」。做不到零改动 |

所以集成说明要分成两篇，不要写成「所有网站都零改动」：

- **已有 Better Auth**：加插件，跑 Better Auth 自己的迁移（如果这个插件没有新表，就连迁移都没有）。业务表不动。这是默认推荐的接法。
- **不用 Better Auth**：说明写明最少要持久化的字段。不把 Better Auth 强加给他们，也不假装可以不存任何东西。

Passkey 的公钥和签名计数留在 Cos72 / KMS，不进站点的表。这样 Better Auth 站点才不用为 Passkey 加列。站点侧只保留「这个 Better Auth 用户对应哪个 Cos72 用户」。

钱包地址、KMS key id 不属于登录完成条件。站点要链上账户时再单独调用 SDK 的账户接口，那一步可以写在自己的业务表里，登录组件不强制。

## 倒推

从上面的发布物往回，有四步。前三步各有落点，第四步是这些都稳定之后的验收。

| 步 | 要得到什么 | 文档 |
|---|---|---|
| 1 | 依赖清单，以及每一行如何锁定、如何跟着更新。合约地址、ABI、ABI 的封装都从这一行来，应用里不再各写一份 | [COS72_DEPENDENCY_BASELINE.md](./COS72_DEPENDENCY_BASELINE.md) |
| 2 | 在锁定的 Better Auth 上做 Provider。目标已在认证规划里写过，开发任务单独开 | [COS72_BETTER_AUTH_PROVIDER_TASK.md](./COS72_BETTER_AUTH_PROVIDER_TASK.md) |
| 3 | 看清仓库里的「密码」到底是用户登录，还是别的东西。用户登录不依赖密码 | 本文下一节 |
| 4 | 依赖按第 1 步锁定之后，用一条技术链路把组件嵌进一个站并走通 | 本文最后一节 |

你消息的最后一句停在「通过技术上的链条去为一个」。下面第四节按已经能确定的对象来写：为一个外部网站走通嵌入、注册和再次登录。若「为一个」后面还有别的对象（例如为一个社区发积分、为一个用户创建链上账户），那是登录组件发布之后的下一条链路，不放进这次的完成定义。

## 第三部分：代码里的密码

用户登录这条路径上没有密码。注册页写着 “No password — just your email and a passkey”。`auth.service.ts` 写明第一次见到邮箱就创建用户，系统里没有密码。控制器只有邮箱验证码和 KMS Passkey，没有密码注册或密码登录。全仓库没有 `from "bcrypt"`、`from "passport-local"` 或对应的 `require`。

叫「密码」的东西还有三处，都不是用户凭证：

| 位置 | 用户会不会碰到 | 实际是什么 |
|---|---|---|
| `aastar/package.json` 的 `bcrypt@^6.0.0`、`@types/bcrypt`、`passport-local@^1.0.0`、`@types/passport-local` | 不会 | 依赖残留。源码和测试都没有引用。多半是早期准备过本地账号密码登录，后来改成验证码之后没有删干净 |
| `passport`、`@nestjs/passport`、`passport-jwt` | 会，但是无感 | 在用。`JwtStrategy` 用它们校验 Bearer JWT。这是本仓库自己的会话，不是用户设置的密码。发布组件之后，站点会话不再由这套 JWT 签发 |
| `DATA_TOOLS_PASSWORD` | 只有打开 `/data-tools` 的人 | 管理员共享口令。`DataToolsService` 用字符串相等比较，环境变量缺了就落到默认值 `admin123456`。前端那个 `type="password"` 只是输入框遮住字符。这是运维门，而且默认值弱、比较方式是明文 |
| 设置页的 AAStar API Key，`type="password"` | 会 | 遮住 API Key 的输入框，不是登录密码。Key 留在浏览器本地，用来调用 KMS 和 Bundler |

因此：用户场景下不依赖密码，这和代码的登录实现一致。仓库里还能看见密码，是因为残留依赖没删，以及一个管理员工具用了共享口令。

处理方式：

- 做组件时不把 `bcrypt`、`passport-local` 带进 SDK，也不在本仓库补密码登录。
- 本仓库清理认证依赖时删掉 `bcrypt`、`@types/bcrypt`、`passport-local`、`@types/passport-local`。`passport-jwt` 留到本仓库 JWT 会话退役再删。
- `DATA_TOOLS_PASSWORD` 不放进登录组件。若这个导入导出工具还要留，应去掉默认口令 `admin123456`，未配置就拒绝访问。那是单独的运维修复，不阻塞组件发布。

## 第四部分：依赖稳定之后的技术链路

第 1 步的表里每一行都有锁定之后，用一个空的样板站证明链路，不靠本仓库现在的 Nest 登录。

1. 样板站安装锁定版本的 `@aastar/sdk`，只从 `@aastar/sdk/auth` 引用登录组件。
2. 按集成说明挂上 Better Auth 和 `cos72()`。不配置 Google、GitHub 的 client secret，不配置 KMS 密钥。
3. 新浏览器打开：按钮是注册。完成 Passkey，或 Google，或 GitHub，三者至少一件。需要自填邮箱时走一次验证码。
4. 站点会话里出现这个用户。Better Auth 的 `account` 表有一行 `providerId = cos72`。业务表没有为这次登录加列。
5. 同一浏览器再打开：按钮是登录，不再创建第二个用户。
6. 站点仓库里搜不到用户密码、私钥、验证码和 OAuth client secret。
7. 登录后打开站点上的 `/account`（或说明里写的那个路由），看到账户页：没有链上账户时可以创建，已有账户时能看到地址、余额、该社区的代币、Gasless 所用的 Paymaster，并能发起一笔由 Paymaster 付款的转账。
8. 创建账户的交易由中继送出，样板环境变量里没有部署私钥。

`@aastar/sdk/auth` 只对第 1 到第 6 步负责。第 7、第 8 步由 `@aastar/sdk/account` 的账户页负责。两步都绿，这次封装才算发布完成。Operator、Admin、Community 管理后台不在这条链路里。

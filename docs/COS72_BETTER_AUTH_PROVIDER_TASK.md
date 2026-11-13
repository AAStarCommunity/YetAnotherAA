# 开发任务：在锁定的 Better Auth 上做 Cos72 Provider

> 状态：独立开发任务的规划，未开工。日期：2026-11-13。
> 结果定义在 [COS72_SDK_COMPONENT.md](./COS72_SDK_COMPONENT.md)。凭证和仓库摸底在 [COS72_AUTH_PROVIDER_PLAN.md](./COS72_AUTH_PROVIDER_PLAN.md)。依赖怎么锁在 [COS72_DEPENDENCY_BASELINE.md](./COS72_DEPENDENCY_BASELINE.md)。
> 代码不进本仓库。本仓库只在这个任务发出 SDK 版本之后，把样板改成按集成说明安装。

## 任务边界

在 `@aastar/sdk` 里新增子路径 `@aastar/sdk/auth`。它依赖 Better Auth 的一个锁定 commit，不修改 Better Auth 的上游仓库，也不把 Better Auth 的源码拷进 AAStar 的仓库。

这个任务交付登录和注册。账户页（余额、Gasless、社区代币、转账、恢复）是 `@aastar/sdk/account` 的另一个任务，读本任务留下的会话，不写进 `cos72()` 插件。运营门户、合约 ABI、本仓库的 `bcrypt` 清理也不在这里。

先决条件：依赖基线里 Better Auth 的候选 SHA 已在开工当天再对过 `main`，并写进 SDK 的 lock。候选记录是 `0a014aef61c83a293da224b5d926a0e43253b732`（2026-11-12 的 `main`）。对不上就改用当天确认的 SHA，并改依赖基线文档里的那一行。

## 站点最终怎么写

已有 Better Auth 的站，业务表不动：

```ts
import { betterAuth } from "better-auth";
import { cos72 } from "@aastar/sdk/auth";

export const auth = betterAuth({
  plugins: [
    cos72({
      issuer: process.env.COS72_ISSUER_URL,
      clientId: process.env.COS72_CLIENT_ID,
    }),
  ],
});
```

`COS72_CLIENT_ID` 是 Cos72 发给这个站点的标识。Google、GitHub 的 client secret 和 KMS 密钥不出现在这里。

页面放一个组件。Cos72 返回这个人还没有账户时，按钮是注册；已有账户时，按钮是登录。站点用 Better Auth 原来的 session 认出用户。`account` 表增加一行 `providerId = "cos72"`，不要求站点加列。

## 服务端要做的流程

Cos72 作为身份源，站点作为客户端。Better Auth 文档里这是 OAuth 2.1 / OIDC 这一侧（让别的应用用你登录），不是让站点自己去配 Google 的那一侧。

1. 发现文档：发行方提供 `/.well-known/openid-configuration`，站点插件只填 `issuer` 和 `clientId`。
2. 用户点按钮。发行方查看是否已有 Cos72 用户（邮箱、Google subject、GitHub subject、Passkey credential id，任一命中）。
3. 没有：走注册。已验证邮箱可以从 Google 或 GitHub 带来；否则发一次邮箱验证码，验证码仍由 Cos72 的邮件服务发出，不进站点数据库。然后完成 Passkey、Google、GitHub 至少一种。三种都没有，不发用户 ID。
4. 已有：走登录。Passkey 沿用现在的 KMS begin / complete 语义，但调用方改成 SDK，不再要求站点调用本仓库的 `POST /auth/login/kms/*`。
5. 回到站点时只给：`sub`（Cos72 用户 ID）、邮箱、`emailVerified`、已绑定的凭证种类。不给密码，不给私钥，不给 Google / GitHub 的 access token。
6. 同一 `sub` 再次进入，Better Auth 命中已有的 `account` 行，不建第二个用户。

Passkey 建议存在用户自己的 iCloud 钥匙串或 Google 密码管理器里。这件事写进注册完成页的说明，不由服务端替用户打开同步。丢一把之后的恢复仍是 2-of-3，链接到现有恢复说明，不在这个任务里重写。

## 工作顺序

1. 在 SDK 仓库锁定 Better Auth 的 SHA，加 `@aastar/sdk/auth` 的空导出，确认包能发布出这个子路径。
2. 实现「有没有这个用户」的探测，以及按钮所需的 `isNewUser`。
3. 接上邮箱验证码和 KMS Passkey。用现有后端的行为做对照，不把 Nest 控制器拷进 SDK。
4. 接上 Google 和 GitHub。两个 OAuth 应用建在 Cos72 名下。默认开。不再做密码开关。
5. 写集成说明：已有 Better Auth 的站、从零使用 Better Auth 的站。不用 Better Auth 的站只给身份字段表，并标明那不是零改动。
6. 用一个不在 YetAnotherAA 业务页面里的最小样板走通注册和再次登录。样板可以先放在 SDK 仓库，通过后再放到本仓库替换现有登录页。

## 完成标准

- 站点代码只有 `issuer` 和 `clientId`，没有用户密码字段，没有 KMS 密钥。
- 新用户看到注册，完成后 `account.providerId` 为 `cos72`。再次进入看到登录，用户行数不增加。
- 关掉网络上的本仓库 Nest 登录路由，样板仍能完成上面两步。这一条证明组件不依赖 YetAnotherAA 的 JWT。
- 集成说明随 SDK 版本发布，说明里的版本号等于该次 npm 版本。

## 不做

- 不 fork Better Auth，不在本任务里升级无关的上游重构。
- 不把 Registry、Paymaster、转账放进 `cos72()`。
- 不实现密码登录。
- 不改社区多签「单独一票不够门限」的规则。
- 不在这个任务里清理 YetAnotherAA 的 `bcrypt` 残留。清理记录在结果文档的密码一节，另做。

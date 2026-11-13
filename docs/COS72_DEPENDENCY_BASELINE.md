# 依赖基线：锁定什么，以及怎样跟上

> 状态：规划。日期：2026-11-13。
> 这是 [COS72_SDK_COMPONENT.md](./COS72_SDK_COMPONENT.md) 倒推的第 1 步。
> 摸底时本仓库消费的 SDK 是 `@aastar/sdk@0.43.0`（锁文件解析到 npm 上的 0.43.0）。地址样例来自 `aastar/env.sepolia.example`，会过期；以 SDK 里的 canonical 为准。

目标：组件发布时，站点只锁定 `@aastar/sdk` 的一个版本。合约地址、ABI、对 ABI 的封装都在这个版本里面。站点不复制 ABI，不在自己的环境变量里维护一套合约地址。本仓库里现有的地址环境变量是过渡期的覆盖，组件发布前要能删掉而不影响登录样板。

## 谁锁定谁

```
站点 / 本仓库样板
  只锁定 @aastar/sdk 的一个精确版本
      @aastar/sdk/auth          登录组件（尚未发布）
      @aastar/sdk/kms           Passkey、账户、转账编排
      @aastar/sdk/core          地址、ABI、viem 封装
      @aastar/sdk/email         验证码发送
          锁定 better-auth 的一个 commit
          锁定合约的部署版本（地址 + version()）
          ABI 只在 SDK 内生成和导出
```

应用侧再抄一份 ABI 或地址，就会和 SDK 各走各的。`env.sepolia.example` 里那组 `*_ADDRESS` 就是这种副本，文档和 README 里的 `0.34.0` 也是。基线的要求是：登录样板的地址只从 `getCanonicalAddresses(chainId)` 来。

## 清单

「当前」一列是 2026-11-13 在本仓库看到的值。「锁定物」是以后要钉住的东西，不是又抄一份地址进本文。

| 依赖 | 当前 | 锁定物 | 登录组件要不要它 |
|---|---|---|---|
| `@aastar/sdk` | `^0.43.0`，锁文件为 0.43.0。已有子路径：`core`、`account`、`paymaster`、`identity`、`tokens`、`dapp`、`x402`、`channel`、`enduser`、`operator`、`admin`、`kms`、`airaccount`、`email`。没有 `auth` | SDK 发版时的精确版本，例如 `0.44.0`。样板用这个版本，不用 `^` | 要。组件就是它的 `./auth` |
| Better Auth | 本仓库未安装。2026-11-13 `main` 候选 `0a014aef61c83a293da224b5d926a0e43253b732` | SDK 的依赖里写完整 git commit，不写 `main`，不写 dist-tag | 要。Provider 建在这个 commit 上 |
| `@simplewebauthn/browser` | 前端直接依赖 `^13.3.0`，SDK 0.43.0 自己也依赖 `^13.2.2` | 只留在 SDK 里，版本由 SDK 发版时钉死。样板去掉直接依赖 | 要。Passkey 仪式用它 |
| `viem` | 根 `package.json` 的 `overrides` 钉在 `2.47.6`，`ox` 钉在 `0.14.7` | 跟着 SDK 对该版本的声明走。应用的 override 只在和 SDK 冲突时短期存在，冲突解除就删 | 登录路径不直接调用。账户路径要 |
| React / Next | 前端 React `19.2.0`（根 override 同一版本），Next `^16.1.1` | 组件声明 peerDependency，样板用说明里写明的一对版本 | 组件的 React 绑定要。无 UI 的服务端插件不绑 Next |
| NestJS 11、`passport-jwt` | 本仓库后端在用，给自己的 JWT 用 | 不进 SDK 的 auth 子路径 | 不要。这是旧会话 |
| `bcrypt`、`passport-local` | 在 `aastar/package.json`，源码无引用 | 不锁定，删除 | 不要 |
| Resend | 后端 `resend@^6.14.0`，发送走 `@aastar/sdk/email` | API 和发件域名由 Cos72 服务锁定；SDK 锁定 `@aastar/sdk/email` 那一版的调用方式 | 要服务，站点不拿 API key |
| KMS | 默认 `https://kms1.aastar.io` | 端点写在 SDK 默认配置。换端点是运维发布，不是站点改代码 | 要 |
| BLS / DVT | 样例种子 `https://v1.aastar.io`，另有文档中的 `dvt*.aastar.io` 与 `yetanotheraa-validator.onrender.com` | SDK 的签名客户端默认端点。登录组件不调用 | 登录不要。转账要 |
| 链 RPC、Pimlico Bundler | `ETH_RPC_URL`、`BUNDLER_RPC_URL` | 样板的默认端点写在 SDK 或样板说明。密钥不进仓库 | 登录不要。建账户和转账要 |
| EntryPoint v0.7 | 样例 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | SDK canonical + 链上 `version()`（EntryPoint 是规范地址，仍要记在 SDK 的链配置里） | 登录不要 |
| AirAccount 工厂 / Validator | 样例工厂 `0x91E60482a2B343004dF29EB205C4F6916E864700`，validator `0xD9756c11686B59F7DDf39E6360230316710485af` | 同上，只活在 `@aastar/sdk/core` | 登录不要。创建账户要 |
| SuperPaymaster、Paymaster 工厂、aPNTs | 样例 `0x16cE0c7d…`、`0xfDE46715…`、`0xDf669834…` | 同上 | 不要 |
| Registry、Staking、GToken、xPNTs Factory、MySBT、价格源、两份 Sale 合约 | 见 `env.sepolia.example` | 同上。门户功能用，登录组件不读 | 不要 |

ABI 不单列成站点依赖。`@aastar/sdk/core` 已经导出例如 `AAStarAirAccountV7ABI`、`BLSAggregatorABI`。封装（`GuardClient`、`TokenSaleClient`、`AirAccountServerClient` 等）随同一个 SDK 版本发布。合约仓库改 ABI 时，先改 SDK、发一版 SDK，样板再改自己锁定的 SDK 版本。样板不直接跟踪合约仓库。

## 怎样保持锁定，又怎样更新

每一行只有一个更新入口。入口不在本仓库的页面里。

| 种类 | 锁定怎么写 | 何时看要不要动 | 动之前核对什么 | 谁改 |
|---|---|---|---|---|
| SDK 版本 | 样板 `package.json` 写精确版本，提交 `package-lock.json` | SDK 发 release，或登录组件需要新的导出 | 样板按集成说明再走一遍注册和再次登录；`version()` 与 SDK 声明的合约版本一致 | 本仓库只改样板的版本号 |
| Better Auth 的 commit | SDK 仓库的依赖字段写 `github:better-auth/better-auth#<40位sha>` | 每季度看一次 `main`；上游安全通告随时看 | 只看 SDK 里 Provider 的测试：无账户走注册，有账户走登录，`account` 表不增加业务列 | SDK 仓库改 SHA，发一版 SDK。本仓库不改 Better Auth 源码 |
| 合约、ABI、封装 | SDK 发版说明里写链 ID、地址、`version()`、对应的合约 git 标签 | 合约仓库打标签并通知 SDK | SDK 自己的测试读链上 `version()`，和发版说明一致；样板不复制 ABI | 合约仓库 → SDK 发版 → 样板升级 SDK |
| WebAuthn 库 | 只出现在 SDK 的 lock 里 | SDK 升级该依赖时一起看 | 样板里一次真实 Passkey 注册和一次登录 | SDK |
| viem / ox | 优先用 SDK 声明的版本。本仓库根上的 `overrides` 是历史钉法 | 升级 SDK 时看 override 是否还要 | 前后端 `type-check` | 能删掉 override 就删 |
| KMS、邮件、BLS、Bundler、RPC | 默认端点写在 SDK 配置。密钥在部署环境，不在 git | 服务换域名或换合约时发运维说明 | 样板对默认端点做一次健康检查；密钥轮换不改站点代码 | AAStar 运维 |
| 本仓库环境变量里的地址副本 | 不继续加。登录样板不读它们 | 每次删一个调用点 | 删完后样板仍从 SDK canonical 读到同一地址 | 本仓库 |

更新不是自动跟 `main` 或 `latest`。流程是：上游变了 → 在拥有该锁定的仓库里改锁定 → 跑该行的核对 → 再让下游改自己的版本号。下游不跳过中间层去跟更上游。

## 这一步做完的标志

- 有一份 SDK 发版说明，里面的合约地址和 `version()` 与链上一致，ABI 只从该版本的 `@aastar/sdk/core` 导出。
- 样板的登录路径不读取 `ENTRY_POINT_*`、`AASTAR_ACCOUNT_*`、`REGISTRY_ADDRESS` 这些变量。
- Better Auth 的 SHA 写在 SDK 的依赖里，而不是写在本文当作已经安装。本文里的 `0a014aef…` 仍是候选，开工时再对一次 `main`。

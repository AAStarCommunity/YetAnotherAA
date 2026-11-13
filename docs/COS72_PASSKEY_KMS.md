# Passkey 与 KMS：登录、签名、社区自建

> 状态：已确认的方案。日期：2026-11-13。
> 分支：`docs/cos72-auth-provider`。
> 配套：[COS72_SDK_COMPONENT.md](./COS72_SDK_COMPONENT.md)、[COS72_AUTH_PROVIDER_PLAN.md](./COS72_AUTH_PROVIDER_PLAN.md)。
> 代码依据：`aastar-frontend/app/auth/register/page.tsx` 的 `runPasskeyWalletSetup`，`aastar-frontend/lib/webauthn-rp.ts`，`aastar/src/kms/kms.service.ts`。

## 两笔记录

Passkey 和链上私钥不是同一把钥匙，也不写在同一个地方。

| | Passkey | 链上私钥 |
|---|---|---|
| 是什么 | 设备上的 WebAuthn 凭据。Face ID / 指纹弹出的就是它 | KMS 的 TEE 里生成的签名钥匙。以太坊账户的 owner 指向它 |
| 创建者 | 用户的手机或电脑。KMS 不生成 Passkey | 选定的那一台 KMS，在 `completeRegistration` 时生成 |
| 登记名 | rpId 固定为 `aastar.io` | `kmsKeyId`，外加这台机器的地址 `kmsEndpoint` |
| 谁能拿走 | 出不了设备。iCloud 钥匙串或 Google 密码管理器只在用户自己的设备之间同步 | 出不了那台 TEE |
| 作用 | 登录时证明是本人；签名前授权 TEE 使用那把私钥 | 对 UserOperation 签名 |

「登记在 `aastar.io`」只指第一列的 rpId。它不表示注册数据库在 AAStar 的服务器上。

## 现在的登录和签名

再次登录依赖 Passkey 已经在某一台 KMS 里登记过。登录时浏览器交出断言，这台 KMS 用当初存下的公钥来核对。

签名依赖的是登记那一次在同一台 KMS 里生成、并和这把 Passkey 绑在一起的私钥。Passkey 的私钥不参与链上签名。

今天的注册顺序：

1. 邮箱验证码只证明这个邮箱属于这个人。它不创建钥匙。
2. `kmsClient.beginRegistration` 向选定的 KMS 要 WebAuthn 参数。
3. 浏览器在 `account.aastar.io` 上执行 `startRegistration`。Passkey 的 rpId 是 `aastar.io`。
4. `completeRegistration` 把凭据交回这台 KMS。KMS 保存凭据 ID 和 Passkey 公钥，在 TEE 里生成链上私钥，返回 `KeyId` 和 `CredentialId`。
5. `linkWallet` 把 `kmsKeyId`、地址、`credentialId` 写进账户。

之后的转账调用这台 KMS 的 `BeginAuthentication`。断言对上之后，TEE 用已绑定的私钥签名。

## 社区自建 KMS

社区启动自己的 KMS，例如 `https://kms.aaa.com`，在插件配置里填这一次。成员不用各自填写。别的社区留空，则使用 `https://kms.aastar.io`。

新成员从该社区站点第一次创建账户时：

1. 对话框仍在 `account.aastar.io` 弹出。rpId 仍是 `aastar.io`。这一步不把 Passkey 生成在 KMS 里面。
2. `beginRegistration` 和 `completeRegistration` 都发到 `https://kms.aaa.com`。
3. 私钥在 `kms.aaa.com` 的 TEE 里生成，并与这把 Passkey 的公钥绑定。
4. 账户记下 `kmsEndpoint = https://kms.aaa.com` 和对应的 `kmsKeyId`。

以后他在任何一个接入网站上签名，浏览器还是在 `account.aastar.io` 用这把 Passkey 出断言。插件按账户记录把断言送到 `kms.aaa.com`。只有这台机器存了公钥，只有这台 TEE 里有私钥。

`kms.aaa.com` 必须允许来源 `https://account.aastar.io`，并且按 rpId `aastar.io` 核对断言。不允许的话，它会拒绝这次签名。现有后端已经遇到过同类错误：不转发 Origin 时，KMS 退回名单里的第一个 rpId（`aastar.io`），和浏览器实际用的源不一致就失败。见 `aastar/src/kms/kms.service.ts`。

## 不冲突的部分，和会冲突的部分

rpId 写着 `aastar.io`，注册记录写在 `kms.aaa.com`，这两件事不冲突。域名决定对话框在哪弹出；KMS 的地址决定哪一台机器保存公钥和私钥。

冲突发生在把一把已经交给另一台 KMS 的 Passkey，再拿去让 `kms.aaa.com` 验证。它没有这把凭据的公钥，验不了，也不能把别的 TEE 里的私钥改绑过来。

因此一把 Passkey 只绑定创建时那一台 KMS。一个人在两台自建 KMS 上各创建一次账户，会得到两把 rpId 都是 `aastar.io` 的 Passkey。一个社区只用自己这一台，成员从这里第一次创建，就只有一把。

已经创建的账户不能靠修改插件里的网址搬走。要换 KMS，必须在新 TEE 里生成新私钥，再走 `rotate-signer` 或 2-of-3 恢复，更换链上 owner。

## 默认和自建怎么同时存在

| 谁 | 配置 | 第一次创建的结果 |
|---|---|---|
| 不自建的社区 | 插件里 KMS 地址留空 | 私钥在 `kms.aastar.io`，Passkey rpId 为 `aastar.io` |
| 自建的社区 | 插件里写 `https://kms.aaa.com` | 私钥在社区的 TEE 里，Passkey rpId 仍为 `aastar.io` |
| 用户本人 | 创建之前改自己的 KMS 地址 | 只影响他自己这一次创建，不改社区给其他成员的默认值 |

同一把 Passkey 可以在所有使用这一台 KMS 的网站上弹出。换一台 KMS 就是另一次创建，不是同一把 Passkey 的第二次使用。

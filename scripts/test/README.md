# scripts/test — 测试准备 + 链上(L1)用例脚本

配套 `docs/TEST_PLAN.md`（用例）与 `docs/TEST_PREPARATION.md`（准备）。

## 用法

```bash
# 0) 准备：复制模板，填入测试 EOA 私钥等（.env.test 已 gitignore）
cp scripts/test/.env.test.example scripts/test/.env.test

# 1) 体检：未全绿(❌)不开始测试
npm run test:prereqs            # Sepolia
node scripts/test/check-prereqs.mjs --mainnet

# 2) L1 链上用例（真实交易，写证据台账 docs/test-evidence/）
npm run test:onchain           # 全部已注册用例
node scripts/test/onchain/run.mjs TOK-01   # 单条
```

## 目录

```
scripts/test/
  .env.test.example     # 测试变量模板（提交）；.env.test 真值不提交
  check-prereqs.mjs     # 准备体检（env/服务/RPC/KMS/DVT/余额/AirAccount）
  onchain/
    _lib.mjs            # 共享：env 加载、viem 客户端、证据写入
    run.mjs             # 运行器（注册表 CASES）
    tok-01-gasless-buy.mjs   # 示例/模板：gasless 买入(已实证)
docs/test-evidence/<net>/<caseId>.json   # 每条用例的真实凭证(txHash 等)
```

## 加一条 L1 用例

新建 `onchain/<id>.mjs`，导出 `{ id, desc, run(ctx) }`（`ctx` 见 `_lib.ctx()`：env/chainId/account/publicClient/walletClient/explorer），`run` 返回 `{ actor, txHash, blockNumber, status, artifacts }`；在 `run.mjs` 的 `CASES` 注册。运行器自动写证据台账并按 status 判定。

## L1 路线图（按 TEST_PLAN 用例，逐个补全）

| 脚本 | 用例 | 状态 |
|---|---|---|
| `tok-01-gasless-buy.mjs` | TOK-01 gasless 买 aPNTs | ✅ 示例已就绪 |
| `tok-03-selfpay-buy.mjs` | TOK-03/04 self-pay 买入 | ⏳ 待补 |
| `tok-11-stake-ticket.mjs` | TOK-11 质押 GToken→SBT | ⏳ |
| `xfer-01-transfer.mjs` | XFER-01 Tier-2 转账 | ⏳（需 AirAccount + KMS ceremony；半自动） |
| `grd-03-decrease-limit.mjs` | GRD-03~08 Guard 写 | ⏳（需 AirAccount+guard） |
| `rec-06-recovery.mjs` | REC-06 社交恢复 | ⏳ |
| `com-a-02-register.mjs` | COM-A-02 注册社区 | ⏳ |
| `com-u-01-ticket.mjs` | COM-U-01 购 ticket | ⏳ |

> 凡涉及 AirAccount 设备-passkey ceremony 的（转账/Guard 写/恢复）= **半自动**：L1 脚本走后端 prepare → 在浏览器/CDP 完成 passkey → submit；或用 L3 Playwright + CDP 虚拟认证器全自动。详见 `docs/TEST_PLAN.md §4.6`。

> L2(API e2e) 在 `aastar/test/`；L3(Playwright) 待建 `aastar-frontend/e2e/`。

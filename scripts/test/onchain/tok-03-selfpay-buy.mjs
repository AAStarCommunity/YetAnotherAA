// TOK-03 — self-pay GToken buy (USDC). EOA pays its own gas: approve (if needed)
// then buyTokens. See docs/TEST_PLAN.md D2. Buys $1 of GToken into the test EOA.
import { TokenSaleClient, usd } from "@aastar/sdk/tokens";
import { formatUnits } from "viem";

export const id = "TOK-03";
export const desc = "Self-pay GToken buy ($1, USDC) — EOA pays gas";

export async function run({ chainId, account, publicClient, walletClient }) {
  const sale = new TokenSaleClient(publicClient, walletClient, { chainId });
  const amount = usd(1);
  const quoted = await sale.quote("GTOKEN", amount);
  if (quoted === 0n) throw new Error("quote 0 — amount too small / sale unavailable");
  const minOut = (quoted * 98n) / 100n; // 2% slippage floor (GToken self-pay takes minOut)

  const result = await sale.buySelfPay({
    token: "GTOKEN",
    usdAmount: amount,
    payToken: "USDC",
    minOut,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: result.txHash,
    timeout: 180_000,
    pollingInterval: 5_000,
  });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${result.txHash}`);

  return {
    actor: account.address,
    txHash: result.txHash,
    approveTxHash: result.approveTxHash ?? null,
    blockNumber: Number(receipt.blockNumber),
    gasPayer: receipt.from,
    status: receipt.status,
    artifacts: {
      token: "GToken",
      payToken: "USDC",
      usdSpent: "1",
      expectedOut: formatUnits(quoted, 18),
    },
  };
}

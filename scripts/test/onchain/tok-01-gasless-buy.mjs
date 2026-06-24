// TOK-01 — gasless aPNTs buy via the DVT relay pool (EIP-3009 + BuyIntent, no ETH).
// Proven path; see docs/TEST_PLAN.md D2. Buys $1 of aPNTs into the test EOA.
import { TokenSaleClient, usd } from "@aastar/sdk/tokens";
import { formatUnits } from "viem";

export const id = "TOK-01";
export const desc = "Gasless aPNTs buy ($1, USDC) — relayer pays gas";

export async function run({ chainId, account, publicClient, walletClient }) {
  const sale = new TokenSaleClient(publicClient, walletClient, { chainId });
  const amount = usd(1);
  const quoted = await sale.quote("APNTS", amount);
  if (quoted === 0n) throw new Error("quote 0 — amount too small / sale unavailable");
  const minOut = (quoted * 98n) / 100n;

  const { txHash, matchedRule } = await sale.buyGasless({
    token: "APNTS",
    usdAmount: amount,
    recipient: account.address,
    minOut,
  });

  // Sepolia + relayer can be slow to mine; wait generously before declaring failure.
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 180_000,
    pollingInterval: 5_000,
  });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${txHash}`);

  return {
    actor: account.address,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasPayer: receipt.from, // the DVT relayer that sponsored gas
    status: receipt.status,
    artifacts: {
      token: "aPNTs",
      usdSpent: "1",
      expectedOut: formatUnits(quoted, 18),
      matchedRule,
    },
  };
}

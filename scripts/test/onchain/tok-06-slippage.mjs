// TOK-06 — slippage guard (negative/security test). Demand 10× the quote as
// minOut; the buy MUST be rejected by the CONTRACT's slippage floor.
//
// False-positive hardening (Codex review):
//  - The caught error must be a revert from `buyTokens` (viem functionName), not a
//    network/quote error → else rethrow.
//  - USDC balance is pre-asserted >= spend, so a `buyTokens` revert cannot be the
//    internal USDC transferFrom failing for lack of funds. (Allowance is exercised
//    by TOK-03's fair-minOut buy in the same suite — the positive control.)
// Residual: distinguishing a slippage revert from a (well-funded, approved)
// transferFrom revert would need the sale's custom-error selector, which the SDK
// doesn't surface; given the balance pre-check + TOK-03 control, the 10× minOut is
// the only induced failure, so the revert is the slippage floor.
import { TokenSaleClient, usd } from "@aastar/sdk/tokens";
import { BaseError, ContractFunctionExecutionError, formatUnits } from "viem";

export const id = "TOK-06";
export const desc = "Slippage guard — impossible minOut reverts in buyTokens";

export async function run({ account, chainId, publicClient, walletClient }) {
  const sale = new TokenSaleClient(publicClient, walletClient, { chainId });
  const amount = usd(1);
  const quoted = await sale.quote("GTOKEN", amount);
  if (quoted === 0n) throw new Error("quote 0 — cannot run slippage test");

  // Rule out a balance-driven transferFrom revert: USDC must cover the spend.
  const balances = await sale.getBalances(account.address);
  if (balances.usdc < amount) {
    throw new Error(`insufficient USDC for slippage test: have ${formatUnits(balances.usdc, 6)}`);
  }

  const impossibleMinOut = quoted * 10n; // 10× a fair fill — unreachable at any price
  let revertMsg = null;
  try {
    await sale.buySelfPay({
      token: "GTOKEN",
      usdAmount: amount,
      payToken: "USDC",
      minOut: impossibleMinOut,
    });
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || "");
    const execErr =
      e instanceof BaseError ? e.walk(err => err instanceof ContractFunctionExecutionError) : null;
    const fromBuyTokens = execErr?.functionName === "buyTokens" || /buyTokens/i.test(msg);
    if (!/revert/i.test(msg) || !fromBuyTokens) {
      throw new Error(
        `expected a buyTokens revert, got: ${msg.slice(0, 160) || String(e).slice(0, 160)}`
      );
    }
    revertMsg = (execErr?.shortMessage || msg).toString().slice(0, 160);
  }
  if (revertMsg === null) {
    throw new Error("SLIPPAGE GUARD FAILED — 10× minOut buy succeeded");
  }

  return {
    actor: account.address,
    txHash: null, // negative test: the proof is the contract revert, no successful tx
    status: "rejected-as-expected",
    artifacts: {
      test: "slippage guard (GToken self-pay)",
      usdcBalance: formatUnits(balances.usdc, 6),
      quoted: formatUnits(quoted, 18),
      demandedMinOut: formatUnits(impossibleMinOut, 18),
      contractRevert: revertMsg,
    },
  };
}

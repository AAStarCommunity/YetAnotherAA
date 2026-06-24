// TOK-11 — stake GToken (the ticket/SBT path: GToken stake → ticket).
// NOTE: FinanceClient's INSTANCE methods (approveAndStake/getGTokenBalance) don't
// reliably resolve the configured chain's GToken in a node/L1 context (looks like
// SDK config state isn't shared across /core and /tokens entrypoints) — they hit a
// no-code address and revert with `balanceOf returned 0x`. Worked around with
// explicit canonical addresses + the static stakeGToken; reported to the SDK.
import { FinanceClient } from "@aastar/sdk/tokens";
import { getCanonicalAddresses, ERC20ABI } from "@aastar/sdk/core";
import { parseEther, formatEther } from "viem";

export const id = "TOK-11";
export const desc = "Stake GToken (ticket/SBT path) — 1 GToken";
// Skipped in the default run: stake() reverts — staking is role-based and the
// ticket→SBT mint flow needs SDK clarification (see docs/TEST_RESULTS.md S1).
export const blocked = "stake() reverts — role-based staking / ticket-mint flow TBD";

export async function run({ chainId, account, publicClient, walletClient }) {
  const { gToken, staking } = getCanonicalAddresses(chainId);
  const amount = parseEther("1");

  const bal = addr =>
    publicClient.readContract({
      address: gToken,
      abi: ERC20ABI,
      functionName: "balanceOf",
      args: [addr],
    });
  const before = await bal(account.address);
  if (before < amount) throw new Error(`insufficient GToken: have ${formatEther(before)}, need 1`);

  // Approve the staking contract for the GToken if needed (standard ERC-20).
  const allowance = await publicClient.readContract({
    address: gToken,
    abi: ERC20ABI,
    functionName: "allowance",
    args: [account.address, staking],
  });
  let approveTxHash = null;
  if (allowance < amount) {
    approveTxHash = await walletClient.writeContract({
      address: gToken,
      abi: ERC20ABI,
      functionName: "approve",
      args: [staking, amount],
    });
    const approveReceipt = await publicClient.waitForTransactionReceipt({
      hash: approveTxHash,
      timeout: 120_000,
      pollingInterval: 5_000,
    });
    if (approveReceipt.status !== "success") throw new Error(`approve reverted: ${approveTxHash}`);
  }

  const txHash = await FinanceClient.stakeGToken(walletClient, staking, amount);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 180_000,
    pollingInterval: 5_000,
  });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${txHash}`);

  // The stake must actually move the GToken out of the account.
  const after = await bal(account.address);
  if (after !== before - amount) {
    throw new Error(
      `stake did not debit GToken: before ${formatEther(before)}, after ${formatEther(after)}`
    );
  }
  return {
    actor: account.address,
    txHash,
    approveTxHash,
    blockNumber: Number(receipt.blockNumber),
    gasPayer: receipt.from,
    status: receipt.status,
    artifacts: {
      staked: "1 GToken",
      stakingContract: staking,
      gTokenBefore: formatEther(before),
      gTokenAfter: formatEther(after),
    },
  };
}

import { test, expect } from "@playwright/test";
import { parseEther } from "viem";
import { registerAccount } from "./helpers/register";
import { fundWithEth, getEthBalance, getCode, waitForBalanceIncrease } from "./helpers/fund";

// S4 / XFER-01 — a fresh account's first transfer deploys (initCode) + executes via
// the passkey ceremony (KMS + BLS signer network + bundler). DVT/BLS must be online.
// Proof of execution is the RECIPIENT's balance rising by the sent amount — not just
// "account has bytecode" (deploy can succeed while the inner call reverts) — per Codex.

const RECIPIENT = "0xb5600060e6de5E11D3636731964218E53caadf0E" as const; // the test EOA
const AMOUNT = "0.001";

test("XFER-01: fresh account first transfer (deploy + execute via passkey)", async ({ page }) => {
  test.setTimeout(240_000);

  const { address } = await registerAccount(page);
  await fundWithEth(address as `0x${string}`, "0.02");

  // Pre-condition: the account is NOT yet deployed (the transfer must deploy it),
  // so the post-checks can't pass vacuously.
  expect(await getCode(address as `0x${string}`), "account undeployed before transfer").toBe("0x");
  const recipientBefore = await getEthBalance(RECIPIENT);

  // Reload /dashboard so DashboardContext caches the just-created account, then
  // /transfer reads it from cache and renders the form.
  await page.goto("/dashboard");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.goto("/transfer");
  await expect(page.locator('input[name="to"]'), "transfer form rendered").toBeVisible({
    timeout: 30_000,
  });

  await page.locator('input[name="to"]').fill(RECIPIENT);
  await page.locator('input[name="amount"]').fill(AMOUNT);
  const sendBtn = page.getByRole("button", { name: /^send (transfer|[a-z]+)/i });
  await expect(sendBtn).toBeEnabled({ timeout: 30_000 });

  // Capture the submit response synchronously (no unawaited listener race).
  const [submitResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes("/transfer/submit"), { timeout: 180_000 }),
    sendBtn.click(),
  ]);
  const submitBody = (await submitResp.json()) as {
    userOpHash?: string;
    txHash?: string;
    transactionHash?: string;
  };
  expect(
    submitBody.userOpHash || submitBody.txHash || submitBody.transactionHash,
    "submit returned a UserOpHash/txHash"
  ).toBeTruthy();

  // The real proof the UserOp EXECUTED: the recipient actually received the ETH.
  await waitForBalanceIncrease(RECIPIENT, recipientBefore, parseEther(AMOUNT));
  // And the account got deployed in the same op.
  expect(await getCode(address as `0x${string}`), "account deployed by the transfer").not.toBe(
    "0x"
  );
});

import { test, expect } from "@playwright/test";
import { parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { registerAccount } from "./helpers/register";
import { fundWithEth, getEthBalance, getCode, waitForBalanceIncrease } from "./helpers/fund";

// S4 / XFER-01 — a fresh account's first transfer deploys (initCode) + executes via
// the passkey ceremony (KMS + BLS signer network + bundler). DVT/BLS must be online.
// Proof of execution is the RECIPIENT's balance rising by the sent amount — not just
// "account has bytecode" (deploy can succeed while the inner call reverts) — per Codex.
// The recipient is a FRESH per-test EOA (zero balance, no external traffic) so no
// concurrent tx can race the assertion; the final balance must equal EXACTLY the sent
// amount.

const AMOUNT = "0.001";

test("XFER-01: fresh account first transfer (deploy + execute via passkey)", async ({ page }) => {
  test.setTimeout(240_000);

  const { address } = await registerAccount(page);
  await fundWithEth(address as `0x${string}`, "0.02");

  // Fresh recipient: a brand-new EOA with zero balance and no external traffic, so
  // the balance assertion can't be satisfied by a concurrent unrelated tx (Codex).
  const RECIPIENT = privateKeyToAccount(generatePrivateKey()).address;

  // Pre-condition: the account is NOT yet deployed (the transfer must deploy it),
  // so the post-checks can't pass vacuously.
  expect(await getCode(address as `0x${string}`), "account undeployed before transfer").toBe("0x");
  expect(await getEthBalance(RECIPIENT), "fresh recipient starts empty").toBe(0n);

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

  // The real proof the UserOp EXECUTED: the fresh recipient received the ETH, and
  // since it started at 0 with no other traffic, its balance must equal EXACTLY the
  // sent amount.
  const finalBal = await waitForBalanceIncrease(RECIPIENT, 0n, parseEther(AMOUNT));
  expect(finalBal, "recipient received exactly the sent amount").toBe(parseEther(AMOUNT));
  // And the account got deployed in the same op.
  expect(await getCode(address as `0x${string}`), "account deployed by the transfer").not.toBe(
    "0x"
  );
});

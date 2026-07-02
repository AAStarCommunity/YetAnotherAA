import { test, expect } from "@playwright/test";
import { registerAccount } from "./helpers/register";
import { fundWithEth } from "./helpers/fund";

// L3 (real browser + CDP virtual authenticator) negative-path tests for the transfer flow.
// The security property under test is the same for both: a transfer that should be rejected
// must NEVER produce a successful on-chain submit. A regression that silently sent would fail.

const DEAD = "0x000000000000000000000000000000000000dEaD";

async function gotoTransfer(page: import("@playwright/test").Page) {
  await page.goto("/dashboard");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.goto("/transfer");
  await expect(page.locator('input[name="to"]'), "transfer form rendered").toBeVisible({
    timeout: 30_000,
  });
}

const sendButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /^send (transfer|[a-z]+)/i });

test("XFER-NEG-01: insufficient balance blocks the transfer (no submit)", async ({ page }) => {
  test.setTimeout(120_000);
  // Fresh account, ~0 ETH balance; usePaymaster defaults false so the ETH balance guard applies.
  await registerAccount(page);
  await gotoTransfer(page);

  let submitFired = false;
  page.on("request", r => {
    if (r.url().includes("/transfer/submit")) submitFired = true;
  });

  await page.locator('input[name="to"]').fill(DEAD);
  await page.locator('input[name="amount"]').fill("0.5"); // >> balance

  // The guard relabels the CTA to "Insufficient ETH Balance" and disables it
  // (isTransferDisabled() → true when amount > balance, paymaster off).
  const blockedBtn = page.getByRole("button", { name: /insufficient .*balance/i });
  await expect(blockedBtn, "CTA shows Insufficient ETH Balance").toBeVisible({ timeout: 15_000 });
  await expect(blockedBtn, "CTA is disabled").toBeDisabled();
  // Belt-and-suspenders: even a forced click may not submit anything.
  await blockedBtn.click({ force: true, timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  expect(submitFired, "no /transfer/submit on insufficient balance").toBe(false);
});

test("XFER-NEG-02: cancelled passkey aborts the transfer (no successful submit)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { address } = await registerAccount(page);
  await fundWithEth(address as `0x${string}`, "0.02");
  await gotoTransfer(page);

  await page.locator('input[name="to"]').fill(DEAD);
  await page.locator('input[name="amount"]').fill("0.001");

  // Simulate the user dismissing the biometric prompt: WebAuthn get() rejects with
  // NotAllowedError (exactly what a real cancel throws).
  await page.evaluate(() => {
    navigator.credentials.get = () =>
      Promise.reject(new DOMException("The operation was not allowed.", "NotAllowedError"));
  });

  let submitOk = false;
  page.on("response", r => {
    if (r.url().includes("/transfer/submit") && r.ok()) submitOk = true;
  });

  const send = sendButton(page);
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();

  // The ceremony was cancelled, so the flow must abort: no SUCCESSFUL submit, and we stay on
  // the transfer form (no success screen). Give the app time to attempt + fail.
  await page.waitForTimeout(6000);
  expect(submitOk, "no successful /transfer/submit after passkey cancel").toBe(false);
  await expect(
    page.locator('input[name="to"]'),
    "still on the transfer form (not a success view)"
  ).toBeVisible();
});

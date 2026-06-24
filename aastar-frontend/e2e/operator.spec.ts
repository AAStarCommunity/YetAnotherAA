import { test, expect } from "@playwright/test";
import { registerAccount } from "./helpers/register";
import { installTestWallet } from "./helpers/wallet";

// S5 / OPR — the operator onboarding wizard is signed by the operator's own EOA via
// an injected wallet (window.ethereum). This proves the injected-wallet harness:
// the wizard detects the wallet, connects it, and shows the operator address. The
// full multi-step onboarding (stake → register → deploy paymaster) builds on this.
// Requires backend NODE_ENV=test OTP_TEST_MODE=true.

test("OPR connect: operator wizard connects the injected EOA wallet", async ({ page }) => {
  test.setTimeout(120_000);

  // Inject the wallet BEFORE any navigation (addInitScript), then log in (the
  // /operator pages require auth) via the passkey register flow.
  const walletAddr = await installTestWallet(page);
  await registerAccount(page);

  await page.goto("/operator/deploy");

  // The wizard sees an injected wallet → the Connect button is enabled.
  const connectBtn = page.getByRole("button", { name: /connect/i }).first();
  await expect(connectBtn, "connect enabled (wallet detected)").toBeEnabled({ timeout: 30_000 });
  await connectBtn.click();

  // After connect, the operator EOA address is shown (0x1234…5678 form).
  const short = `${walletAddr.slice(0, 6)}`;
  await expect(
    page.getByText(new RegExp(short, "i")).first(),
    "connected address shown"
  ).toBeVisible({ timeout: 30_000 });
});

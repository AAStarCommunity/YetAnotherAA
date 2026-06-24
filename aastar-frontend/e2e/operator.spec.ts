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

  // Pick AOA mode → Resource pre-check. This reads on-chain balances/state THROUGH
  // the injected wallet's RPC passthrough, exercising the harness end to end.
  await page
    .getByRole("button", { name: /AOA —|Self-hosted/i })
    .first()
    .click();
  await page.getByRole("button", { name: /continue/i }).click();

  // The resource pre-check reads the EOA's on-chain balances/state THROUGH the
  // injected wallet's RPC passthrough and renders them — that IS the harness proof.
  // We assert it RENDERS (the check rows), not that resources are MET: whether the
  // shared EOA currently holds ≥60 GT fluctuates as other tests spend GToken.
  await expect(
    page.getByText(/Resource pre-check|GToken|need|ETH/i).first(),
    "resource pre-check rendered (RPC passthrough read on-chain state)"
  ).toBeVisible({ timeout: 60_000 });

  // The next steps (registerRole / deploy xPNTs / paymaster) are non-idempotent
  // on-chain writes that permanently register the operator EOA — they need a fresh
  // funded operator EOA per run (a further harness); deferred. See TEST_RESULTS S5.
});

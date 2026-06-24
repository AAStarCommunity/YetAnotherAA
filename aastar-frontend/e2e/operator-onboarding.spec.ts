import { test, expect, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { registerAccount } from "./helpers/register";
import { installTestWallet } from "./helpers/wallet";
import { fundWithEth, fundGToken } from "./helpers/fund";

// S5 / OPR-01 — full AOA operator onboarding via the injected EOA wallet:
// connect → AOA → resources → registerRole(ROLE_COMMUNITY) → deploy xPNTs →
// deploy Paymaster V4 → EntryPoint deposit → complete. Each step is a real on-chain
// write signed by the injected wallet. A FRESH operator EOA per run (registerRole is
// non-idempotent), funded with GToken (30 stake + 30 community) + ETH for gas.
// Requires backend NODE_ENV=test OTP_TEST_MODE=true and DVT/BLS online.

// Click a wizard step's action button, then wait for it to advance (Continue
// enables once the on-chain tx confirms), and continue to the next step.
async function doStepThenContinue(page: Page, actionLabel: RegExp, timeout = 220_000) {
  await page.getByRole("button", { name: actionLabel }).first().click();
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont, `${actionLabel} confirmed → continue`).toBeEnabled({ timeout });
  await cont.click();
}

// fixme: the full flow is built (fresh EOA → fund → connect → AOA → resources →
// registerRole → deploy xPNTs → deploy Paymaster V4 → deposit → complete), but it's
// blocked by RPC latency, not test logic: the 5 sequential on-chain writes + funding
// are very sensitive to it, and on the current Infura endpoint even `getTransaction`
// times out (receipt waits exceed 220s). Needs a retry-resilient wait layer and/or a
// stable RPC to run green. The injected-wallet harness + connect + resource pre-check
// are proven in operator.spec.ts (#373). Tracked in docs/TEST_RESULTS.md S5.
// fixme — progress + two remaining blockers:
//  ✓ funding / connect / AOA / resource pre-check all pass now (new Infura RPC +
//    withRetry on receipt waits + explicit gas on the injected wallet's sendTx).
//  ✗ the FIRST write step ("Register Community" → approve + registerRole) does not
//    advance to Continue — the registerRole step doesn't complete (revert / contract
//    precondition / step UI). Needs the register revert reason captured.
//  ✗ the shared test EOA's GToken is now depleted (each run funds 70 GT to a fresh
//    operator EOA), so further runs need the GToken replenished (buy via the sale).
// See docs/TEST_RESULTS.md S5.
test.fixme("OPR-01: full AOA operator onboarding (fresh EOA, injected wallet)", async ({
  page,
}) => {
  test.setTimeout(420_000);

  const opKey = generatePrivateKey();
  const opAddr = privateKeyToAccount(opKey).address;
  // Fund the fresh operator EOA: GToken (AOA stakes 30 + 30 to register community)
  // and ETH for the several writes (deploy paymaster is gas-heavy).
  await fundGToken(opAddr, "70");
  await fundWithEth(opAddr, "0.3");

  await installTestWallet(page, opKey);
  await registerAccount(page); // auth (operator pages require login)

  await page.goto("/operator/deploy");
  // Connect the fresh operator EOA.
  await page
    .getByRole("button", { name: /connect/i })
    .first()
    .click();
  await expect(page.getByText(new RegExp(opAddr.slice(0, 6), "i")).first()).toBeVisible({
    timeout: 30_000,
  });
  // AOA mode → resource pre-check.
  await page
    .getByRole("button", { name: /AOA —|Self-hosted/i })
    .first()
    .click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  const resourcesContinue = page.getByRole("button", { name: /^continue$/i });
  await expect(resourcesContinue, "resources met").toBeEnabled({ timeout: 60_000 });
  await resourcesContinue.click();

  // The four on-chain write steps.
  await doStepThenContinue(page, /Register Community/i); // stake + registerRole
  await doStepThenContinue(page, /Deploy Token/i); // xPNTs
  await doStepThenContinue(page, /Deploy|Paymaster/i); // Paymaster V4
  await doStepThenContinue(page, /Deposit|Fund/i); // EntryPoint deposit

  await expect(page.getByText(/Onboarding complete/i), "onboarding complete").toBeVisible({
    timeout: 180_000,
  });
});

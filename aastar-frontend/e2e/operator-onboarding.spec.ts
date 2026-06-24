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

// fixme — the harness works; the blocker is a registry contract revert, not test code:
//  ✓ funding / connect / AOA / resource pre-check all pass (new Infura RPC +
//    withRetry on receipt waits + explicit gas on the injected wallet's sendTx).
//  ✗ the first write step (Step3) reverts: registryActions.registerRole(ROLE_COMMUNITY)
//    fails on-chain. DIAGNOSED via simulateContract:
//      - a funded fresh EOA (70 GT, allowance 30 to BOTH GTokenStaking and the
//        Registry) still reverts with a BARE "execution reverted" — no reason string,
//        no decodable custom error → not an allowance/spender/balance issue.
//      - the same call on an already-registered EOA decodes cleanly as
//        RoleAlreadyGranted, so the ABI/encoding is right.
//    Likely either a registry precondition that emits no reason, or registerRole is
//    the wrong entrypoint for community onboarding (the SDK has CommunityClient.launch
//    / a registerCommunity path). Needs an aastar-sdk/registry issue — external repo,
//    so file feedback there rather than patching here. See docs/TEST_RESULTS.md S5.
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

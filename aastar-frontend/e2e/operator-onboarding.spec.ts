import { test, expect, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { registerAccount } from "./helpers/register";
import { installTestWallet } from "./helpers/wallet";
import { fundWithEth, fundGToken } from "./helpers/fund";

// S5 / OPR-01 — AOA operator onboarding via the injected EOA wallet, through the two
// community-bootstrap writes: connect → AOA → resources → registerRole(ROLE_COMMUNITY)
// → deploy xPNTs. registerRole carries an encoded community profile (encodeCommunityRoleData
// from SDK 0.26.10) — the fix for the bare-revert in aastar-sdk#169; passing this asserts
// that fix end to end. A FRESH operator EOA per run (registerRole is non-idempotent),
// funded with GToken + ETH for gas.
// The remaining onboarding steps (deploy Paymaster V4 + EntryPoint deposit) are a
// separate follow-up — see docs/TEST_RESULTS.md S5.
// Requires backend NODE_ENV=test OTP_TEST_MODE=true and DVT/BLS online.

// Click a wizard step's action button, then wait for it to advance (Continue
// enables once the on-chain tx confirms), and continue to the next step.
async function doStepThenContinue(page: Page, actionLabel: RegExp, timeout = 220_000) {
  await page.getByRole("button", { name: actionLabel }).first().click();
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont, `${actionLabel} confirmed → continue`).toBeEnabled({ timeout });
  await cont.click();
}

test("OPR-01: operator onboarding — register community (sdk#169 fix) + deploy xPNTs", async ({
  page,
}) => {
  test.setTimeout(300_000);

  const opKey = generatePrivateKey();
  const opAddr = privateKeyToAccount(opKey).address;
  // Fund the fresh operator EOA: GToken (AOA stakes 30 + 30 to register community)
  // and ETH for the several writes (deploy paymaster is gas-heavy).
  await fundGToken(opAddr, "65");
  // Enough ETH for gas across registerRole + the xPNTs token deploy (at the wallet's
  // modest gas price). Kept small — abandoned per-run EOAs strand their balance.
  await fundWithEth(opAddr, "0.15");

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

  // Step 3 — register community: approve + registerRole(ROLE_COMMUNITY) carrying an
  // encodeCommunityRoleData profile. This is the SDK 0.26.10 fix for aastar-sdk#169
  // (an empty "0x" reverts bare on-chain). Reaching the next step proves it landed.
  await doStepThenContinue(page, /Register Community/i);

  // Step 4 — deploy the xPNTs token (Deploy is gated on a filled form).
  await page.getByLabel(/Token Name/i).fill("E2E Points");
  await page.getByLabel(/Token Symbol/i).fill("E2EP");
  await page.getByLabel(/Community Name/i).fill("E2E Community");
  await page.getByLabel(/Exchange Rate/i).fill("10");
  await doStepThenContinue(page, /Deploy Token/i);

  // Reaching the Paymaster step proves BOTH on-chain writes landed: the ROLE_COMMUNITY
  // registration (the #169 fix) and the xPNTs token deploy. The remaining steps
  // (Paymaster V4 deploy + EntryPoint deposit) are a follow-up — see TEST_RESULTS S5.
  await expect(
    page.getByRole("heading", { name: /Paymaster V4/i }),
    "advanced to the Paymaster step → community + xPNTs writes succeeded"
  ).toBeVisible({ timeout: 30_000 });
});

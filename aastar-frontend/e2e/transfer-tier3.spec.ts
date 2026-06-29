import { test, expect, type Page } from "@playwright/test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { parseEther, formatEther, type Address } from "viem";
import { installVirtualAuthenticator } from "./helpers/webauthn";
import { installTestWallet } from "./helpers/wallet";
import { fundWithEth, getEthBalance, getTier2Limit, withRetry } from "./helpers/fund";

// XFER-T3 — #3a B3: a real Tier-3 transfer (passkey + DVT/BLS + guardian co-sign) end to
// end. Builds a guardian-equipped, tier-configured account from scratch (the only way to
// exercise Tier 3 — YAA's free-form accounts have no guardians, see #382), sets a tiny
// tier2 so a small amount lands in Tier 3, then transfers > tier2 and asserts the guardian
// co-sign (collected client-side over the userOpHash) is accepted on-chain.
//
// Requires: backend NODE_ENV=test OTP_TEST_MODE=true, frontend up, DVT + bundler reachable
// (SDK defaults), and a funded TEST_EOA_PRIVATE_KEY (the fund helper's funder).
//
// The two self-hosted guardian keys are generated fresh per run and NEVER committed.

async function authHeaders(page: Page) {
  const token = (await page.evaluate(() => localStorage.getItem("token"))) as string;
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Register a passwordless account WITHOUT creating it (so we can create-with-guardians).
async function registerOnly(page: Page): Promise<{ token: string }> {
  let devCode: string | null = null;
  page.on("response", async resp => {
    if (resp.url().includes("/auth/otp/request")) {
      try {
        const j = await resp.json();
        if (j?.devCode) devCode = String(j.devCode);
      } catch {
        /* non-JSON */
      }
    }
  });
  await page.goto("/auth/register");
  await page.locator('input[type="email"]').fill(`e2e-t3-${Date.now()}@test.local`);
  await page.locator('button[type="submit"]').click();
  const otp = page.locator('input[inputMode="numeric"]');
  await expect(otp).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => devCode, { timeout: 15_000 }).not.toBeNull();
  await otp.fill(devCode!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard|\/$/, { timeout: 45_000 });
  const token = (await page.evaluate(() => localStorage.getItem("token"))) as string;
  expect(token).toBeTruthy();
  return { token };
}

// Submit one account self-call (setTierLimits / setWeightConfig) via the two-phase
// device-passkey UserOp, driven by the CDP virtual authenticator.

test("XFER-T3: Tier-3 transfer with guardian co-sign (passkey + BLS + guardian)", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await installVirtualAuthenticator(page);
  // The guardian that co-signs the transfer = the injected wallet (g1). Fresh keys, uncommitted.
  const g1Pk = generatePrivateKey();
  const g1 = privateKeyToAccount(g1Pk);
  const g2 = privateKeyToAccount(generatePrivateKey());
  await installTestWallet(page, g1Pk); // window.ethereum = g1 signer (the guardian)

  // 1) Register (passkey + KMS owner), no account yet.
  await registerOnly(page);
  const auth = await authHeaders(page);

  // 2) Create-with-guardians: prepare → guardians accept (eth-prefixed) → create.
  const prep = await page.request.post("/api/v1/account/guardian-setup/prepare", {
    ...auth,
    data: { dailyLimit: parseEther("1").toString() },
  });
  expect(prep.ok(), `guardian-setup/prepare: ${prep.status()}`).toBeTruthy();
  const gp = await prep.json();
  const acceptanceHash = gp.acceptanceHash as `0x${string}`;
  const g1Sig = await g1.signMessage({ message: { raw: acceptanceHash } });
  const g2Sig = await g2.signMessage({ message: { raw: acceptanceHash } });
  const created = await page.request.post("/api/v1/account/create-with-guardians", {
    ...auth,
    data: {
      guardian1: g1.address,
      guardian1Sig: g1Sig,
      guardian2: g2.address,
      guardian2Sig: g2Sig,
      dailyLimit: parseEther("1").toString(),
      salt: gp.salt,
      entryPointVersion: "0.7",
    },
  });
  expect(
    created.ok(),
    `create-with-guardians: ${created.status()} ${await created.text()}`
  ).toBeTruthy();
  const acctResp = await page.request.get("/api/v1/account", auth);
  const acctJson = (await acctResp.json()) as { address?: string; account?: { address?: string } };
  const account = (acctJson.address ?? acctJson.account?.address) as Address;
  expect(account).toBeTruthy();

  // 3) Fund + deploy. dailyLimit>0 means the factory also deployed a guard; the first
  // UserOp deploys the account itself.
  await withRetry(() => fundWithEth(account, "0.08"));
  await expect.poll(() => getEthBalance(account), { timeout: 60_000 }).toBeGreaterThan(0n);

  // 4) Arm tiers via the real /tier-setup persona page (#1 verification): the "conservative"
  // profile (tier1 0.005 / tier2 0.05 ETH). This drives the bundled passkey ceremony through the
  // CDP virtual authenticator for both self-call UserOps (setTierLimits + setWeightConfig) — which
  // only pass now that profiles ship passkeyWeight=2 (0.29.2, #227). Confirms #1 end to end.
  // Load the dashboard first so DashboardContext fetches the freshly-created account before
  // /tier-setup reads it from context (a direct deep-link can render before the account loads).
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await page.goto("/tier-setup");
  await expect(page.getByText(/Conservative|保守型/i)).toBeVisible({ timeout: 30_000 });
  await page.getByText(/Conservative|保守型/i).click();
  await page.getByRole("button", { name: /Apply.*account|应用并加固|Re-apply|重新应用/i }).click();
  await expect(page.getByText(/Tier config applied|分层配置已应用/i)).toBeVisible({
    timeout: 120_000,
  });
  // The apply toast fires on submit, before the self-call UserOps mine. Wait until the armed
  // tier-2 is actually on-chain so the transfer's resolveTransfer reads it (not pre-arm zero).
  await expect.poll(() => getTier2Limit(account), { timeout: 90_000 }).toBeGreaterThan(0n);

  // 5) Tier-3 transfer: 0.051 ETH > tier2 (0.05) → needs passkey + BLS + guardian. The UI flow
  // collects the guardian co-sign from window.ethereum (g1) over the userOpHash.
  await page.goto("/transfer");
  await page.locator('input[name="to"]').fill(g2.address); // recipient = g2 (recoverable)
  await page.locator('input[name="amount"]').fill("0.051");
  // Wait for the judging indicator to confirm Tier 3 (the guardian-co-signature line is
  // unambiguous to Tier 3; the "Tier N signing" header's inline {tier} span splits the node).
  await expect(page.getByText(/guardian co-signature/i)).toBeVisible({ timeout: 20_000 });
  const before = await getEthBalance(g2.address);
  await page
    .getByRole("button", { name: /send|transfer/i })
    .first()
    .click();

  // The passkey ceremony + guardian co-sign auto-complete; assert the transfer lands.
  await expect(page.getByText(/submitted|success/i)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => getEthBalance(g2.address), { timeout: 120_000 }).toBeGreaterThan(before);
  console.log(`Tier-3 transfer OK: g2 ${formatEther(before)} → received 0.051 ETH`);
});

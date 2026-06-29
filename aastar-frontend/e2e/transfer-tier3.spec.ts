import { test, expect, type Page } from "@playwright/test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { parseEther, formatEther, type Address } from "viem";
import {
  encodeSetTierLimits,
  encodeSetWeightConfig,
  DEFAULT_WEIGHT_CONFIG,
} from "@aastar/sdk/airaccount";
import { installVirtualAuthenticator } from "./helpers/webauthn";
import { installTestWallet } from "./helpers/wallet";
import { fundWithEth, getEthBalance, withRetry } from "./helpers/fund";

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
async function submitAccountCall(page: Page, to: string, data: string) {
  const auth = await authHeaders(page);
  const prep = await page.request.post("/api/v1/transfer/prepare", {
    ...auth,
    data: { to, amount: "0", data, usePaymaster: false },
  });
  expect(prep.ok(), `prepare: ${prep.status()} ${await prep.text()}`).toBeTruthy();
  const p = await prep.json();
  // The virtual authenticator auto-asserts; drive it through the page context by
  // calling startAuthentication with the returned options.
  const credential = await page.evaluate(async opts => {
    const { startAuthentication } = await import("@simplewebauthn/browser");
    return startAuthentication({ optionsJSON: opts as never });
  }, p.publicKeyOptions);
  const sub = await page.request.post("/api/v1/transfer/submit", {
    ...auth,
    data: { transferId: p.transferId, challengeId: p.challengeId, credential },
  });
  expect(sub.ok(), `submit: ${sub.status()} ${await sub.text()}`).toBeTruthy();
  return sub.json();
}

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

  // 4) Arm tiers: tiny tier2 (0.002 ETH) so a 0.003 ETH transfer is Tier 3; default weights.
  // GATE: setWeightConfig with DEFAULT_WEIGHT_CONFIG currently reverts InsecureWeightConfig on
  // v0.20.3 (passkeyWeight 3 >= tier1Threshold 3) — see aastar-sdk#227. This step (and thus the
  // whole run) only passes once the SDK profile weights / contract tier1 rule are reconciled.
  const tier1 = parseEther("0.001");
  const tier2 = parseEther("0.002");
  const setTiers = encodeSetTierLimits(account, tier1, tier2) as { to: string; data: string };
  await submitAccountCall(page, setTiers.to, setTiers.data);
  const setW = encodeSetWeightConfig(account, DEFAULT_WEIGHT_CONFIG) as {
    to: string;
    data: string;
  };
  await submitAccountCall(page, setW.to, setW.data);

  // 5) Tier-3 transfer: 0.003 ETH > tier2 → needs passkey + BLS + guardian. The UI flow
  // collects the guardian co-sign from window.ethereum (g1) over the userOpHash.
  await page.goto("/transfer");
  await page.locator('input[name="to"]').fill(g2.address); // recipient = g2 (recoverable)
  await page.locator('input[name="amount"]').fill("0.003");
  // Wait for the judging indicator to confirm Tier 3. Match the guardian-co-signature line of
  // the resolved-tier indicator (unambiguous to Tier 3) rather than the "Tier N signing" header,
  // whose inline {tier} span splits the text node.
  await expect(page.getByText(/guardian co-signature/i)).toBeVisible({ timeout: 20_000 });
  const before = await getEthBalance(g2.address);
  await page
    .getByRole("button", { name: /send|transfer/i })
    .first()
    .click();

  // The passkey ceremony + guardian co-sign auto-complete; assert the transfer lands.
  await expect(page.getByText(/submitted|success/i)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => getEthBalance(g2.address), { timeout: 120_000 }).toBeGreaterThan(before);
  console.log(`Tier-3 transfer OK: g2 ${formatEther(before)} → received 0.003 ETH`);
});

import { test, expect, type Page } from "@playwright/test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { formatEther, type Address } from "viem";
import { getCanonicalAddresses } from "@aastar/sdk/core";
import { installVirtualAuthenticator } from "./helpers/webauthn";
import { installTestWallet } from "./helpers/wallet";
import {
  fundWithEth,
  getEthBalance,
  getTier2Limit,
  onboardAPNTsGas,
  waitForNonceStable,
  withRetry,
} from "./helpers/fund";

const PAYMASTER_V4 = getCanonicalAddresses(11155111)!.paymasterV4 as `0x${string}`;

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

  // 2) Create a Tier-2/3 account via the TWO-PHASE passkey-at-birth flow (aastar-sdk#249):
  // prepare (backend pins nonce/deadline + builds the CREATE_ACCOUNT digest + begins the KMS
  // WebAuthn ceremony) → browser ceremony (challenge = the digest, signed by the device passkey
  // via the virtual authenticator) → submit (KMS owner signs the digest, the deployer relays the
  // deploy; the v0.22.0 factory wires validator + owner passkey AT BIRTH — no setValidator/setP256Key).
  // The device passkey captured at registration is the on-chain owner factor; g1 is the ECDSA Tier-3 co-signer.
  const profileResp = await page.request.get("/api/v1/auth/profile", auth);
  const profile = (await profileResp.json()) as { passkeyX?: string; passkeyY?: string };
  expect(
    Boolean(profile.passkeyX && profile.passkeyY),
    `registration must capture the device passkey (x,y); got ${JSON.stringify(profile)}`
  ).toBeTruthy();
  const prepResp = await page.request.post("/api/v1/account/prepare-create-with-passkey", {
    ...auth,
    data: {
      p256Guardians: [{ x: profile.passkeyX, y: profile.passkeyY }],
      ecdsaGuardians: [g1.address],
      dailyLimit: "1",
      entryPointVersion: "0.7",
    },
  });
  expect(
    prepResp.ok(),
    `prepare-create-with-passkey: ${prepResp.status()} ${await prepResp.text()}`
  ).toBeTruthy();
  const prep = (await prepResp.json()) as {
    createId: string;
    challengeId: string;
    publicKeyOptions: Record<string, unknown>;
    predictedAddress: string;
  };
  // Browser WebAuthn ceremony over the prepared CREATE_ACCOUNT digest (the virtual authenticator
  // auto-signs). publicKeyOptions is the @simplewebauthn optionsJSON form (base64url) — decode for
  // navigator.credentials.get(), then re-encode the assertion to AuthenticationResponseJSON.
  const credential = await page.evaluate(async pko => {
    const b64urlToBuf = (s: string) => {
      const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    };
    const bufToB64url = (buf: ArrayBuffer) => {
      const u = new Uint8Array(buf);
      let s = "";
      for (const b of u) s += String.fromCharCode(b);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const o = pko as any;
    const publicKey: any = {
      challenge: b64urlToBuf(o.challenge),
      rpId: o.rpId,
      timeout: o.timeout,
      userVerification: o.userVerification,
      allowCredentials: (o.allowCredentials || []).map((c: any) => ({ ...c, id: b64urlToBuf(c.id) })),
    };
    const cred: any = await navigator.credentials.get({ publicKey });
    const r = cred.response;
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
      response: {
        authenticatorData: bufToB64url(r.authenticatorData),
        clientDataJSON: bufToB64url(r.clientDataJSON),
        signature: bufToB64url(r.signature),
        ...(r.userHandle ? { userHandle: bufToB64url(r.userHandle) } : {}),
      },
    };
  }, prep.publicKeyOptions);
  const created = await page.request.post("/api/v1/account/submit-create-with-passkey", {
    ...auth,
    data: { createId: prep.createId, challengeId: prep.challengeId, credential },
  });
  expect(
    created.ok(),
    `submit-create-with-passkey: ${created.status()} ${await created.text()}`
  ).toBeTruthy();
  const acctResp = await page.request.get("/api/v1/account", auth);
  const acctJson = (await acctResp.json()) as { address?: string; account?: { address?: string } };
  const account = (acctJson.address ?? acctJson.account?.address) as Address;
  expect(account).toBeTruthy();

  // 3) Fund + deploy. dailyLimit>0 means the factory also deployed a guard; the first
  // UserOp deploys the account itself.
  await withRetry(() => fundWithEth(account, "0.08"));
  await expect.poll(() => getEthBalance(account), { timeout: 60_000 }).toBeGreaterThan(0n);

  // 3b) Onboard for gasless: deposit aPNTs into the account's INTERNAL PaymasterV4 balance
  // (balances[account][aPNTs]) — what validatePaymasterUserOp actually charges — and refresh the
  // cached price. Without it the gasless config/transfer UserOps revert AA33
  // Paymaster__InsufficientBalance. 100k aPNTs covers the deploy + transfer ops with headroom.
  await withRetry(() => onboardAPNTsGas(account, "100000"));

  // 4) Arm tiers via the real /tier-setup persona page (#1 verification): the "conservative"
  // profile (tier1 0.005 / tier2 0.05 ETH). This drives the bundled passkey ceremony through the
  // CDP virtual authenticator for both self-call UserOps (setTierLimits + setWeightConfig) — which
  // only pass now that profiles ship passkeyWeight=2 (0.29.2, #227). Confirms #1 end to end.
  // Load the dashboard first so DashboardContext fetches the freshly-created account before
  // /tier-setup reads it from context (a direct deep-link can render before the account loads).
  await page.goto("/dashboard");
  // Bounded — the dashboard polls balances/tasks continuously (more so once the account holds
  // aPNTs), so "networkidle" never settles and would hang to the 300s test cap. A short wait is
  // enough for DashboardContext to fetch the account before /tier-setup reads it.
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
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
  // The persona apply submits TWO UserOps (setTierLimits + setWeightConfig); the tier2 poll only
  // confirms the first landed. Wait for the account nonce to stop advancing so the transfer doesn't
  // prepare a stale nonce that the still-mining setWeightConfig consumes → AA25 invalid account nonce.
  await waitForNonceStable(account);

  // 5) Tier-3 transfer: 0.051 ETH > tier2 (0.05) → needs passkey + BLS + guardian. The UI flow
  // collects the guardian co-sign from window.ethereum (g1) over the userOpHash.
  await page.goto("/transfer");
  await page.locator('input[name="to"]').fill(g2.address); // recipient = g2 (recoverable)
  await page.locator('input[name="amount"]').fill("0.051");
  // Pay gas via PaymasterV4 (gasless) from the account's deposited aPNTs. The account holds no
  // spare ETH for an ETH-paid prefund (and zero-ETH transfers are the whole point), so an ETH-paid
  // path reverts AA21. Check the box, then fill the paymaster address the field reveals.
  await page.locator("#usePaymaster").check();
  await page.locator('input[name="paymasterAddress"]').fill(PAYMASTER_V4);
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

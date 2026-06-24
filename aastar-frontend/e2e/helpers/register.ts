import { expect, type Page } from "@playwright/test";
import { installVirtualAuthenticator } from "./webauthn";

/**
 * Register a fresh passwordless account end-to-end (email → gated devCode OTP →
 * passkey via CDP → KMS AirAccount) and return its identifiers. Requires the
 * backend started with NODE_ENV=test OTP_TEST_MODE=true. See docs/TEST_PLAN.md S4.
 */
export async function registerAccount(
  page: Page
): Promise<{ email: string; token: string; address: string }> {
  await installVirtualAuthenticator(page);

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

  const email = `e2e-${Date.now()}@test.local`;
  await page.goto("/auth/register");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('button[type="submit"]').click();

  const otp = page.locator('input[inputMode="numeric"]');
  await expect(otp).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => devCode, { timeout: 15_000 }).not.toBeNull();
  await otp.fill(devCode!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard|\/$/, { timeout: 45_000 });

  const token = (await page.evaluate(() => localStorage.getItem("token"))) as string;
  expect(token).toBeTruthy();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // A fresh user has a passkey + KMS wallet but no AirAccount yet (GET /account →
  // 204). Create it counterfactually (deploy:false) so the first transfer deploys it.
  let res = await page.request.get("/api/v1/account", auth);
  if (res.status() === 204) {
    const created = await page.request.post("/api/v1/account/create", {
      ...auth,
      data: { deploy: false, entryPointVersion: "0.7" },
    });
    expect(created.ok(), `account/create: ${created.status()}`).toBeTruthy();
    res = await page.request.get("/api/v1/account", auth);
  }
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { address?: string; account?: { address?: string } };
  const address = body.address ?? body.account?.address;
  expect(address, "account has an address").toBeTruthy();
  return { email, token, address: address! };
}

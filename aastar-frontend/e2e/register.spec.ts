import { test, expect } from "@playwright/test";
import { installVirtualAuthenticator } from "./helpers/webauthn";

// AUTH-01/02/03 — full passwordless registration, fully automated:
//   email → OTP (read from the gated devCode, OTP_TEST_MODE=true) → passkey
//   register ceremony (CDP virtual authenticator) → KMS AirAccount.
// Requires the backend started with OTP_TEST_MODE=true. See docs/TEST_PLAN.md S3.

test("AUTH-02: register an account end-to-end (OTP + passkey via CDP)", async ({ page }) => {
  await installVirtualAuthenticator(page);

  // Capture the gated devCode from the OTP request, and the verify response so we
  // can assert the backend actually created/authenticated the account.
  let devCode: string | null = null;
  let verifyBody: { access_token?: string; user?: { email?: string } } | null = null;
  page.on("response", async resp => {
    if (resp.url().includes("/auth/otp/request")) {
      try {
        const j = await resp.json();
        if (j?.devCode) devCode = String(j.devCode);
      } catch {
        /* non-JSON */
      }
    }
    if (resp.url().includes("/auth/otp/verify")) {
      try {
        verifyBody = await resp.json();
      } catch {
        /* non-JSON */
      }
    }
  });

  const email = `e2e-${Date.now()}@test.local`;
  await page.goto("/auth/register");

  // Step 1 — email → send code.
  await page.locator('input[type="email"]').fill(email);
  await page.locator('button[type="submit"]').click();

  // Wait for the OTP step + the captured code.
  const otp = page.locator('input[inputMode="numeric"]');
  await expect(otp).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => devCode, { timeout: 15_000 }).not.toBeNull();

  // Step 2 — enter code → verify → passkey register (CDP) → KMS account.
  await otp.fill(devCode!);
  await page.locator('button[type="submit"]').click();

  // The passkey ceremony auto-completes via the virtual authenticator; the KMS
  // wallet/account setup then runs. Land on the dashboard (off the auth pages).
  await page.waitForURL(/\/dashboard|\/$/, { timeout: 45_000 });
  expect(page.url()).not.toContain("/auth/register");

  // Prove the account was really created — not just a stray redirect:
  // 1) the verify response authenticated THIS email and returned a token.
  // (verifyBody is only assigned inside the response closure, so TS control-flow
  // narrows it away at this point — re-assert the captured type.)
  const verified = verifyBody as { access_token?: string; user?: { email?: string } } | null;
  expect(verified?.access_token, "verifyOtp returned a JWT").toBeTruthy();
  expect(verified?.user?.email).toBe(email);
  // 2) the token is persisted, and /auth/profile confirms it server-side.
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  const profile = await page.request.get("/api/v1/auth/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(profile.status()).toBe(200);
  expect((await profile.json())?.email).toBe(email);
});

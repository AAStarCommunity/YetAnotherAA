import { test, expect } from "@playwright/test";
import { installVirtualAuthenticator } from "./helpers/webauthn";

// S3 — deterministic browser checks that need no auth/OTP. Covers AUTH-10
// (guarded routes redirect), the public landing, and the register entry, plus a
// smoke test that the CDP virtual authenticator installs (the basis for passkey
// flows in register.spec.ts).

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Cos72/i);
});

test("AUTH-10: a guarded route redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/dashboard");
  // The Layout guard sends unauthenticated users to the login/auth page.
  await page.waitForURL(/\/auth\/(login|register)|\/login/, { timeout: 15_000 });
  expect(page.url()).toMatch(/auth\/(login|register)|login/);
});

test("register page shows the email step", async ({ page }) => {
  await page.goto("/auth/register");
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
});

test("CDP virtual authenticator installs (passkey-automation basis)", async ({ page }) => {
  await page.goto("/auth/register");
  const id = await installVirtualAuthenticator(page);
  expect(id).toBeTruthy();
});

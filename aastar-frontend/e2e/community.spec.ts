import { test, expect } from "@playwright/test";
import { registerAccount } from "./helpers/register";

// S5 — read/render flows for the community + operator + role pages (all require
// auth, all read-only → no on-chain writes, no AA2x). One register, then visit
// each page and assert it renders its content (the heavy community-create /
// operator-onboarding write flows are deferred — same UserOp infra as GRD).
// Requires backend NODE_ENV=test OTP_TEST_MODE=true.

test("S5 read flows: community plaza + role + operator render after login", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAccount(page);

  // COM-U-02 — community plaza lists communities (official AAStar + Mycelium, #352).
  await page.goto("/community");
  await expect(
    page.getByText(/AAStar|Mycelium|community|社区/i).first(),
    "community plaza rendered"
  ).toBeVisible({ timeout: 40_000 });

  // ROLE-01 — role/SBT page renders (a fresh account simply has no role yet).
  await page.goto("/role");
  await expect(page.locator("h1, h2").first(), "role page rendered").toBeVisible({
    timeout: 30_000,
  });

  // OPR — operator dashboard renders (fresh account is not an operator).
  await page.goto("/operator");
  await expect(page.locator("h1, h2").first(), "operator page rendered").toBeVisible({
    timeout: 30_000,
  });
});

import { expect, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getCode, getEthBalance } from "./fund";

/**
 * Deploy a fresh (funded) AirAccount by sending its first transfer — the first
 * UserOp deploys the account (and its guard, if created with dailyLimit>0) via
 * initCode. Drives the real /transfer UI + CDP passkey. Returns once the account
 * has on-chain code. Caller must have funded `address` first. See TEST_PLAN S4.
 */
export async function deployAccount(page: Page, address: `0x${string}`): Promise<void> {
  if ((await getCode(address)) !== "0x") return; // already deployed
  // Confirm the funding landed, then give the bundler's node time to see it. The
  // fund tx confirms on our RPC well before Pimlico's node reflects it, so an
  // immediate UserOp fails AA21 ("didn't pay prefund") on a stale zero balance.
  expect(await getEthBalance(address), "account funded before deploy").toBeGreaterThan(0n);
  await new Promise(r => setTimeout(r, 30_000));

  // Reload /dashboard so DashboardContext caches the account, then /transfer renders.
  await page.goto("/dashboard");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.goto("/transfer");
  await expect(page.locator('input[name="to"]'), "transfer form rendered").toBeVisible({
    timeout: 30_000,
  });

  const recipient = privateKeyToAccount(generatePrivateKey()).address;
  await page.locator('input[name="to"]').fill(recipient);
  await page.locator('input[name="amount"]').fill("0.001");
  const send = page.getByRole("button", { name: /^send (transfer|[a-z]+)/i });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await Promise.all([
    page.waitForResponse(r => r.url().includes("/transfer/submit"), { timeout: 180_000 }),
    send.click(),
  ]);

  // Poll until the deploy lands on-chain.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if ((await getCode(address)) !== "0x") return;
    await new Promise(r => setTimeout(r, 4_000));
  }
  throw new Error(`account ${address} not deployed within timeout`);
}

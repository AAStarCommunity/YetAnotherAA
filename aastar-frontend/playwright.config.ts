import { defineConfig, devices } from "@playwright/test";

// L3 browser E2E (see docs/TEST_PLAN.md S3). Runs against the already-running dev
// servers (frontend :5173 → proxies /api to backend :3000). passkey ceremonies are
// driven by a CDP virtual authenticator (e2e/helpers/webauthn.ts) — no real device.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // on-chain/KMS side effects — keep serial + stable
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e/.results.json" }]],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

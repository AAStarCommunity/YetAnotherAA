import { test, expect } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { registerAccount } from "./helpers/register";
import { fundWithEth, getEthBalance } from "./helpers/fund";

// L3 replay negative: a prepared transfer handle (challengeId) is single-use with a ~10-min
// TTL — the KMS ceremony consumes it and the EntryPoint nonce is monotonic. So re-POSTing an
// already-consumed /transfer/submit MUST be rejected (no second transfer). We do one real
// transfer, capture its exact submit request, then replay it verbatim.

// BLOCKED by docs/CREATE_FLOW_BETA_BUG.md: a fresh account can't make its first transfer
// (prepareTransfer fails — v0.22 factory can't deploy-in-initCode), so there is no successful
// first submit to replay. Un-fixme once creation uses v0.23 passkey-at-birth (deploy-at-birth).
test.fixme("XFER-NEG-03: replaying a consumed transfer submit is rejected (no double-spend)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { address } = await registerAccount(page);
  await fundWithEth(address as `0x${string}`, "0.02");
  const RECIPIENT = privateKeyToAccount(generatePrivateKey()).address;

  await page.goto("/dashboard");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.goto("/transfer");
  await expect(page.locator('input[name="to"]'), "transfer form rendered").toBeVisible({
    timeout: 30_000,
  });

  // Capture the first /transfer/submit request so we can replay it byte-for-byte.
  let submitReq: { url: string; headers: Record<string, string>; postData: string | null } | null =
    null;
  page.on("request", r => {
    if (r.url().includes("/transfer/submit") && r.method() === "POST" && !submitReq) {
      submitReq = { url: r.url(), headers: r.headers(), postData: r.postData() };
    }
  });

  await page.locator('input[name="to"]').fill(RECIPIENT);
  await page.locator('input[name="amount"]').fill("0.001");
  const sendBtn = page.getByRole("button", { name: /^send (transfer|[a-z]+)/i });
  await expect(sendBtn).toBeEnabled({ timeout: 30_000 });

  const [submitResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes("/transfer/submit"), { timeout: 180_000 }),
    sendBtn.click(),
  ]);
  const firstBody = (await submitResp.json()) as {
    userOpHash?: string;
    txHash?: string;
    transactionHash?: string;
  };
  expect(
    firstBody.userOpHash || firstBody.txHash || firstBody.transactionHash,
    "first submit succeeded"
  ).toBeTruthy();
  expect(submitReq, "captured the submit request").not.toBeNull();

  const balAfterFirst = await getEthBalance(RECIPIENT);
  expect(balAfterFirst, "recipient received the first (legit) transfer").toBeGreaterThan(0n);

  // REPLAY the exact same submit (same transferId/challengeId/credential). The prepared handle
  // is single-use (consumed by the first submit), so this MUST be rejected.
  const replay = await page.request.post(submitReq!.url, {
    headers: submitReq!.headers,
    data: submitReq!.postData ?? "",
  });
  let replayBody: {
    userOpHash?: string;
    txHash?: string;
    transactionHash?: string;
    success?: boolean;
  } = {};
  try {
    replayBody = await replay.json();
  } catch {
    /* non-JSON error body */
  }
  const replaySucceeded =
    replay.ok() &&
    replayBody.success !== false &&
    !!(replayBody.userOpHash || replayBody.txHash || replayBody.transactionHash);
  expect(
    replaySucceeded,
    `replay of a consumed submit must be rejected (status=${replay.status()}, body=${JSON.stringify(replayBody).slice(0, 160)})`
  ).toBe(false);

  // And no second transfer may have landed: the recipient balance must not have doubled.
  const balAfterReplay = await getEthBalance(RECIPIENT);
  expect(balAfterReplay, "no second transfer from the replay").toBe(balAfterFirst);
});

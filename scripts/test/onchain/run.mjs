#!/usr/bin/env node
/**
 * L1 on-chain test runner. Runs the available cases against the configured chain,
 * writes a real evidence record (tx hash etc.) per case, and exits non-zero on any
 * failure. See docs/TEST_PLAN.md (§4.1) and docs/TEST_PREPARATION.md.
 *
 *   node scripts/test/onchain/run.mjs                 # all cases, Sepolia
 *   node scripts/test/onchain/run.mjs TOK-01          # one case
 *   node scripts/test/onchain/run.mjs --mainnet       # mainnet (needs MAINNET_ENABLED)
 *
 * Add a case: drop a `<id>.mjs` exporting { id, desc, run(ctx) } and register it below.
 */
import { ctx, writeEvidence } from "./_lib.mjs";
import * as tok01 from "./tok-01-gasless-buy.mjs";

// Registry — grows as cases land (one per TEST_PLAN case id).
const CASES = [tok01];

const filter = process.argv.find(a => /^[A-Z]+-\d+$/.test(a));
const selected = filter ? CASES.filter(c => c.id === filter) : CASES;
if (selected.length === 0) {
  console.error(`No case matches "${filter}". Known: ${CASES.map(c => c.id).join(", ")}`);
  process.exit(1);
}

const c = ctx();
console.log(`\nL1 on-chain — chain ${c.chainId} (${c.chain.name}) · actor ${c.account.address}\n`);

let failed = 0;
for (const tc of selected) {
  process.stdout.write(`▶ ${tc.id} ${tc.desc} … `);
  try {
    const record = await tc.run(c);
    const file = writeEvidence(tc.id, c.chainId, { desc: tc.desc, ...record, by: "auto" });
    console.log(`✅  ${c.explorer}/tx/${record.txHash}`);
    console.log(`   evidence: ${file}`);
  } catch (e) {
    failed++;
    console.log(`❌  ${String(e.message || e).slice(0, 160)}`);
  }
}

console.log(`\n${selected.length} case(s) · ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

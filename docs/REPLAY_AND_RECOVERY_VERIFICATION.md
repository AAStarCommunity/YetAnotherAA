# Beta-pre verification: replay rejection + social recovery

> Two beta-pre negatives that are **live/integration** flows (need a funded account, KMS,
> and — for recovery — an on-chain timelock), so they can't be deterministic headless
> tests. This records the protection **mechanism** (grounded in code) + an **owner runbook**
> to verify on Sepolia, with status. Date: 2026-07-02.

## 1. Replay rejection (challenge / nonce) — beta-pre #3

**Mechanism (already in place, by design):**
- The prepared transfer handle is **single-use with a ~10-min TTL** — `transfer.service.ts`
  ("The prepared handle is single-use and ~10min TTL"). The KMS `/SignHash` ceremony
  **consumes** the `ChallengeId`; reusing it is rejected.
- The UserOp **EntryPoint nonce** is monotonic on-chain; replaying a landed UserOp with a
  used nonce reverts (AA25).
- The challenge itself is the **WYSIWYS commitment** over the exact payload, so it can't be
  re-pointed at a different transfer.

So replay protection is enforced at the **KMS (challenge consumption) + EntryPoint (nonce)**
layers, not in app code — there is no app-level unit test that meaningfully covers it.

**Owner runbook (Sepolia, funded passkey account):**
1. Transfer page → prepare + submit a small transfer; confirm it lands (tx on-chain).
2. Capture the `challengeId` from the prepare response (devtools/network).
3. Re-POST `/transfer/submit` with the **same** `challengeId` + credential →
   **expect rejection** (challenge consumed / TTL). ✅ = replay blocked.
4. Also: after a successful transfer, retry the exact prepared op → expect nonce/AA25 reject.

**Status:** mechanism ✅ (code-confirmed); end-to-end run ⬜ (owner, live).

## 2. Social recovery — beta-pre #1

**Flow (backend `guardian.controller.ts`):** `guardian/add` → `recovery/initiate` →
`recovery/support` (guardian co-sign) → **on-chain 2-day timelock** → `recovery/execute`
(backend relayer sends `executeRecovery()`), plus `recovery/cancel` and
`recovery/:accountAddress` (status). P256 (passkey) guardian path:
`recovery/p256/prepare` + `recovery/p256/submit`.

**Existing runbook:** `docs/social-recovery-e2e-test.md` (3 MetaMask guardians, full steps
+ expected results). The **only slow part is the 2-day on-chain timelock** before `execute`.

**Recommended split for beta:**
- Verify NOW (fast, no timelock): add/remove guardian, `recovery/initiate`, guardian
  `support`/co-sign, `recovery/cancel`, status endpoint, and **replay/unauthorized
  rejections** (non-guardian can't support; can't execute before timelock; can't replay a
  used recovery). These prove the flow + its guards without waiting.
- `recovery/execute` happy path requires the **2-day timelock** — schedule one full run
  (initiate → wait 2 days → execute) before the OP-mainnet release (phase 2).

**Status:** design ✅ + runbook ✅; fast-path e2e ⬜ (owner); full timelock run ⬜ (owner, phase 2).

## 3. Beta recommendation

Neither is deterministically testable headless. For beta:
- **Replay:** mechanism is sound (KMS single-use + nonce); do the owner runbook once on
  Sepolia to confirm, then ship.
- **Recovery:** run the **fast-path + rejection** checks before beta; **gate the full
  timelocked recovery as "experimental" in beta** and complete the 2-day run before mainnet.

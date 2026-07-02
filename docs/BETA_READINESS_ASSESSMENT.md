# YAA Beta Readiness Assessment

> Objective assessment of YetAnotherAA's current functionality, test status, and what's
> needed for a beta release. Evidence-based (on-chain txs, test counts, and the team's own
> `LAUNCH_READINESS_PLAN.md`). Last updated: 2026-07-02 · Network verified: **Sepolia**.

Release plan this assessment supports:
1. Ship a **beta** on the current imx93 board once the 2nd board arrives (KMS HA).
2. Test ~1 month, then ship an **OP mainnet** version.
3. Meanwhile, harden the infra (KMS/DVT/bundler/paymaster + API-key model).

---

## 1. Feature overview (by user type)

| User | Capabilities | Pages | Maturity |
|---|---|---|---|
| **End user** | passkey register/login, account-at-birth, gasless transfer (Tier 1/2/3), receive, buy aPNTs/GToken, balances/history, address book, tiered-security setup, raise limits, Guard, social recovery, approval contact | dashboard, transfer, receive, tokens, address-book, tier-setup, tier-raise, guard, recovery, guardian-sign, binding, role, settings | **core on-chain-verified**; recovery/Guard unverified |
| **Operator** | register role, deploy xPNTs / PaymasterV4 / SuperPaymaster, EntryPoint deposit, manage | operator, operator/deploy, operator/manage/* | **incomplete** (Step-5 revert + `operator/status` 500) |
| **Community** | plaza, join, points | community | read flows pass; create/onboarding write pending |
| **Protocol/Admin** | protocol admin, data tools | admin, data-tools | internal |
| **Public** | about/contact/privacy/terms | — | ✅ |

---

## 2. Core flows — status, UX, assessment

### 2.1 Passkey account creation & management
- **Impl:** v0.22/0.23 **passkey-at-birth** — factory wires validator + owner p256Key at deploy (one tx, no post-setup). direct/EOA-owner mode.
- **Test:** ✅ on-chain (regression 2026-06-30, SDK 0.30 / contracts v0.22; DEMO on 0.34 / v0.23). Backend suite **41/41**; register flow Playwright **5/5** (CDP virtual authenticator).
- **UX:** register (Face ID/fingerprint) → account created → dashboard; tier-setup / tier-raise.
- **Gaps:** KMS-relay creation mode was an SDK gap (#249); only EntryPoint v0.7 verified (v0.6/0.8 untested).

### 2.2 Gasless transaction (the most mature flow) ⭐
- **Impl:** Tier 1 (inline P256) / Tier 2 (passkey + BLS) / Tier 3 (passkey + BLS + guardian ECDSA); #234 device-passkey single ceremony; PaymasterV4 sponsors gas with aPNTs (send holding 0 ETH).
- **Test:** ✅ real Sepolia — DEMO tx `0xa275c4aa…`; Tier-2 (0x09) + Tier-3 (0x0a) composite signatures ACCEPTED on-chain; tampered-challenge rejected; Playwright `transfer-tier3.spec.ts` **1 passed**; gasless buy TOK-01 ✅.
- **UX:** pick token/amount → Use Paymaster (choose paymaster) → passkey confirm → poll status. Recent fixes: subdomain rpId (#399), passkey re-registration error guidance, paymaster type hints.
- **Assessment:** **this is the beta core** — strongest evidence.

### 2.3 Social recovery ⚠️ (highest-attention gap)
- **Impl:** guardians (ECDSA + P256 passkey), multi-step recovery wizard, 48h + on-chain 2-day timelock, backend relayer sends `executeRecovery()`.
- **Test:** ❌ only a **verification *plan*** doc (expected results, not executed); readiness plan lists Guardian/recovery under **"uncovered · high priority."** No evidence files.
- **Assessment:** recovery is a **safety promise** — must not ship un-verified. Either verify Sepolia happy-path + replay-rejection, or **label experimental / disable in beta.**

### 2.4 Guard (daily limit / strict mode)
- **Test:** 📄 GRD-04 doc ready; **real-device reproduction pending** (owner task). Tier-3 enforcement depends on it.

---

## 3. Test infrastructure (objective)

| Layer | Status |
|---|---|
| Backend unit | **41/41 green** (6 suites) |
| Frontend unit | **0** ("No tests yet") |
| Frontend e2e (Playwright) | 8 specs; transfer / register / community-read / public green; **Guard write, operator Step-5 pending** |
| On-chain L1 scripts | TOK-01/03/06 ✅ with evidence; TOK-04/11 blocked |
| Negative/abuse matrix (D1–D6) | **mostly unwritten** — robustness unknown |
| Mainnet | **untested** (planned last — matches phase 2) |
| Real-device passkey / real wallet / mainnet | manual, pending |

The team's own launch DoD (`LAUNCH_READINESS_PLAN.md`) has **8 items, 0 checked.**

---

## 4. Beta judgment

**Beta-ready core (hardest evidence):** register → passkey account creation → **gasless Tier 1/2/3 transfer** → buy aPNTs/GToken → balances/history. This path is on-chain-proven on Sepolia.

### Must-do before beta (safety/stability)
- [ ] **Social recovery:** verify Sepolia happy-path + replay-rejection, OR label "experimental / unavailable" in beta.
- [ ] **Fix `operator/status` 500** (`hasRole(undefined)`).
- [ ] **Guard real-device reproduction** (Tier-3 forced-transfer prerequisite).
- [ ] **High-priority negative cases:** JWT 401, challenge/nonce replay rejection, insufficient-balance rejection, passkey-cancel → no submit.
- [ ] **KMS single point of failure:** 2nd imx93 (already awaited) for HA.
- [ ] **Ops:** cos72 runs on one laptop + launchd — add process/service **liveness monitoring + alerting**.
- [ ] **Data migration gap:** the pure-frontend localStorage stores (address book / token list / paymaster list) do **not** import existing backend data — decide whether beta needs a one-time import, or beta starts fresh. (N/A if beta ships the non-migration stack.)

### OK to defer to beta-period / phase 2
- Mainnet smoke (phase 2 by design); full negative matrix; operator onboarding completion (beta-gate operator); multi-EntryPoint (limit beta to v0.7); frontend unit tests; browser-bundle secret-leak check (DoD #8).

---

## 5. Mapping to the 3-phase plan

| Phase | Recommendation |
|---|---|
| **1. Beta on current board (after 2nd imx93)** | Reasonable — 2nd board fixes KMS SPOF. Do must-do 1–4 first; scope beta to **register + gasless transfer + buy**; mark recovery/operator experimental; add liveness monitoring. |
| **2. ~1 month → OP mainnet** | During the month: negative matrix, recovery full verification, Guard real-device, operator onboarding closure, frontend unit tests. **Mainnet small-amount smoke before release** (DoD #4). |
| **3. Harden infra meanwhile** | KMS HA (2 boards), DVT node stability, bundler/paymaster deposit monitoring, **API-key model / KMS Origin** (also the prerequisite for the paused pure-frontend migration — do together). |

---

## 6. Improvement priorities

- **P0 (before beta):** recovery verified-or-gated; `operator/status` 500; high-priority negative cases; process/service monitoring.
- **P1 (beta period):** Guard real-device; operator onboarding closure; frontend unit tests (at least transfer/auth critical paths); error-copy pass (passkey/paymaster done — extend to recovery/Guard).
- **P2 (before mainnet):** mainnet smoke; multi-EntryPoint; full negative matrix; bundle leak check (DoD #8).

---

## 7. Bottom line

The **gasless-transfer + passkey-account-creation** path has enough Sepolia evidence to be the **beta core**. But **social recovery is unverified, Guard/operator are not closed, and abuse-path robustness is unknown** — so beta should **scope to the proven core, label unverified features experimental**, and clear "recovery happy-path, operator 500, high-priority negatives, service monitoring" before going live.

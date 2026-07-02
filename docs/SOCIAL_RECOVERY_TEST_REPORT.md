# Social Recovery — On-Chain Test Report (Sepolia)

> Full record of the headless end-to-end verification of AirAccount social recovery: the
> approach, the machinery, every transaction, the result, and how to reproduce. The goal was
> to prove the **48-hour recovery timelock** (the core security property) on-chain without
> the 2-day wait. Date: 2026-07-02. Network: Sepolia (chainId 11155111).

## 1. Objective

AirAccount social recovery lets a quorum of **guardians** rotate a lost account's owner,
gated by a **48-hour timelock** (`RECOVERY_DELAY` in the contract; `RECOVERY_DELAY_MS =
48*60*60*1000` mirrored in the backend). The timelock is the security window: if guardians
are compromised and propose a malicious recovery, the real owner has 48h to notice and
cancel. Beta-pre goal: **prove the timelock is enforced on-chain** — i.e. `executeRecovery()`
reverts before 48h — plus the surrounding propose/approve/cancel flow.

## 2. The problem we had to solve first

The recovery guardian actions (`proposeRecovery` / `approveRecovery` / `cancelRecovery`)
require `msg.sender == guardian`, and guardians can be **ECDSA EOAs** — so those calls are
headless-signable with funded test keys. But:

- **No existing account had guardians** (0 of 104 in the DB) — every account was created
  guardian-less.
- **Account creation is passkey/KMS-owned.** The normal create flow sets an owner passkey via
  a WebAuthn/KMS ceremony (a browser step), which is not headless. The backend's
  `create-with-guardians` (ECDSA guardians at birth) also returned `deployed:false` —
  counterfactual only — because the deployer key that would broadcast the deploy is unset
  (the same gap the relay proposal, `RELAY_SERVICE_PROPOSAL.md`, addresses).

So to get a **deployed account with ECDSA guardians** headlessly, we bypassed the
passkey/KMS path entirely and deployed directly through the factory with an **ECDSA owner**.

## 3. Approach — headless deploy via the factory

The AAStar account factory (`0xc5095E3B3b248007ef69E09F81F75612fBE629ce`) exposes
`createAccount(owner, salt, InitConfig config, bytes32 ownerP256X, bytes32 ownerP256Y,
uint256 nonce, uint256 deadline, bytes ownerSig)`. The account supports an **ECDSA owner**
(no passkey) when `ownerP256X/Y = 0` and `approvedAlgIds` includes `ALG_ECDSA (2)`.

We used three funded Sepolia EOAs — a fully client-side setup, no KMS, no backend:

| Role | Key | Address |
|---|---|---|
| Owner + deploy sender | `PRIVATE_KEY_JASON` | `0x51C00187e940FA5cbAD256cbB2A5fDb173A09708` |
| Guardian 1 | `PRIVATE_KEY_BOB` | `0xF7Bf79AcB7F3702b9DbD397d8140ac9DE6Ce642C` |
| Guardian 2 | `PRIVATE_KEY_ANNI` | `0xEcAACb915f7D92e9916f449F7ad42BD0408733c9` |

Built with `@aastar/sdk/core` primitives:

1. `buildInitConfig({ guardians: [{ ecdsa: BOB }, { ecdsa: ANNI }], dailyLimit, approvedAlgIds: [2,3,4,9,5,10] })` → `InitConfig`.
2. `airAccountFactoryActions(FACTORY)(pub).getAddress({ owner, salt, config, ownerP256X:0, ownerP256Y:0 })` → the deterministic account address.
3. `createNonces({ owner })` → the create nonce (0 for a fresh owner+salt).
4. `buildCreateAccountHash({ chainId, factory, owner, salt, ownerP256X:0, ownerP256Y:0, config, nonce, deadline })` → the owner-authorization digest.
5. **Owner signature format: EIP-191** (`signMessage({ message: { raw: digest } })`). A raw ECDSA sign of the digest reverted; EIP-191 succeeded.
6. `writeContract(factory.createAccount, [owner, salt, config, 0, 0, nonce, deadline, ownerSig])` from JASON.

> Note: the SDK's `airAccountFactoryActions(...).createAccount()` write path failed against the
> Alchemy RPC ("JSON is not a valid request object"); a direct viem `writeContract` against a
> public RPC (`ethereum-sepolia-rpc.publicnode.com`) worked. Reads were unaffected.

**Deploy result:** account `0x9ECa8Bc911a848B7F37a08d2098DF52F01a7a276` deployed with guardians
BOB + ANNI — tx **`0x0eefae72db4c23a85414ca9b0a1d8b3b3289fa3735d86de125b04a9142eba967`**.

## 4. Recovery flow tested — every transaction

Harness: `aastar/scripts/test/onchain/recovery-timelock-verify.mjs`. ABI:
`proposeRecovery(address)`, `approveRecovery()`, `executeRecovery()`, `cancelRecovery()`,
`activeRecovery() → (newOwner, proposedAt, approvalBitmap, cancellationBitmap)`.

| # | Step | Caller | Tx | Result |
|---|---|---|---|---|
| 0 | read `activeRecovery()` | — | — | empty (`proposedAt=0`) |
| 1 | `proposeRecovery(0x…bEEF)` | Guardian1 (BOB) | `0xc25054eac9d256c06e70b17c9b89ee371981db778899b76c5768c04ef34d6f23` | ✓ proposed (`proposedAt` set) |
| 2 | `approveRecovery()` | Guardian2 (ANNI) | `0x466d6e38afc3036f8f2262893b3bc378605d5dec4b696c28d12ef7ff88496451` | ✓ quorum (2-of-N) |
| 3 | `executeRecovery()` **before 48h** | any | — | ✓ **REVERTED** `0xaa40cfc6` (timelock) |
| 4 | `cancelRecovery()` ×2 (quorum vote) | BOB, then ANNI | `0x2e9797488d18f2fc9f97f79a27debe186bed9b4f52ddf4a5ddd548103a87f703`, `0x4bcccacde877c12ad26c1276c45a7edc8bf202d62ae5f8a48878722ac1306ca6` | ✓ cleared (`proposedAt=0`) |

**Result: PASS — recovery timelock enforced.**

### Key finding: cancel is a quorum vote

`cancelRecovery()` is **not** a single-caller clear — it is a **2-of-N quorum vote** (like
approve). A single guardian's cancel records the vote in `cancellationBitmap` but does not
clear the proposal; both guardians must vote to reach quorum. An earlier harness run asserted
a single cancel would clear and reported a false FAIL — the harness was corrected to cast both
votes (this matches the contract, confirmed by re-run: the proposal cleared only after the
second cancel `0x9abf7a9f65afd78d733e6b2120fa7b3d310c754b425e52166ee0002ab71c59f2`).

### What the harness asserts (not just observes)

To avoid false positives the harness enforces, on-chain: (a) after approve, `approvalBitmap`
popcount ≥ 2 (**quorum actually reached** before the execute test — otherwise a "quorum not
met" revert could masquerade as the timelock); (b) `executeRecovery` reverts with **exactly**
selector `0xaa40cfc6` (any other selector / a success ⇒ FAIL); (c) a single guardian's cancel
leaves the proposal **active** (`proposedAt ≠ 0`), and only the second cancel clears it —
proving cancel is a vote. (Hardening added after an adversarial Codex review.)

## 5. Security closed-loop — who can do what (empirically verified)

| Action | Authorized caller | Notes |
|---|---|---|
| `proposeRecovery` / `approveRecovery` / `cancelRecovery` | **guardian only**, 2-of-N quorum vote | owner does NOT participate |
| `executeRecovery` | anyone (relayer) | only after quorum **and** 48h |
| daily transfers | owner | not part of recovery |

**Empirically confirmed:** the account owner (JASON, `owner() == 0x51C0…`) calling
`cancelRecovery()` **reverts** — cancel is guardian-only. Owner ≠ guardian here.

**Is the loop self-consistent / a safe closed loop?** Yes, under the standard M-of-N
honest-guardian assumption — and specifically it does NOT deadlock on owner-key theft:

- **Owner key stolen/lost** → this is exactly what recovery is *for*. Guardians propose → approve
  → (48h) → execute → owner rotates to a fresh key. The thief holding the old owner key **cannot
  stop it** (owner can't cancel). No deadlock. The 48h + per-tx tier limits bound the damage the
  thief can do in the meantime.
- **A minority of guardians compromised** → can't reach the 2-of-N quorum → cannot propose/execute
  a malicious recovery. Safe.
- **A quorum of guardians compromised (malicious recovery)** → the 48h timelock is the defense: the
  real owner has ~2 days to react. But note the asymmetry — **the owner cannot cancel; only
  guardians can.** So blocking a malicious recovery relies on *honest guardians* reaching a cancel
  quorum. Practical guidance: choose N large and diverse enough that an attacker can't hold both a
  propose-quorum and a cancel-blocking share (e.g. 2-of-3 with 2 compromised guardians is NOT safe);
  optionally add the owner as one of the guardians so the owner can join cancel votes.
- **Owner key AND all guardians lost** → account frozen (ultimate failure, requires losing
  everything). Mitigate with enough independent guardians.

Why owner-can't-cancel is correct: if the owner could cancel, a thief holding a stolen owner key
would cancel every legitimate recovery, defeating the whole mechanism. Delegating cancel to the
guardian set (the trusted parties) is the right call for the "owner key may be the compromised
thing" threat model.

## 6. What is NOT covered

- **Successful post-timelock execute.** `executeRecovery()` succeeding after 48h needs the real
  2-day wait on Sepolia (its clock can't be fast-forwarded). Run this once as a one-shot before
  the phase-2 OP-mainnet release: propose → approve → wait 48h → execute → verify owner rotated.
- **P-256 (passkey) guardian path** (`proposeRecoveryWithSig`) — this report covers ECDSA guardians only.

## 7. Reproduce

```bash
# (guardian account already deployed at 0x9ECa8Bc9…; to redeploy, use the factory createAccount
#  flow in §3 with a fresh salt.)
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
ACCOUNT=0x9ECa8Bc911a848B7F37a08d2098DF52F01a7a276 \
NEW_OWNER=0x000000000000000000000000000000000000bEEF \
node aastar/scripts/test/onchain/recovery-timelock-verify.mjs
```

Guardian keys default to `PRIVATE_KEY_BOB` / `PRIVATE_KEY_ANNI` from `aastar/.env`. The harness
is idempotent — it cancels any pre-existing active recovery before starting.

See also `docs/REPLAY_AND_RECOVERY_VERIFICATION.md` (mechanism + beta split).

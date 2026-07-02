# Beta bug: account creation uses the legacy (undeployed, no-tier) path

> Confirmed 2026-07-02 while trying to run the transfer-replay e2e. A freshly-created account
> **cannot make its first gasless transfer**, and tier limits require a separate aPNTs-gated
> step — both because the creation UI is behind the SDK. Root causes below, both verified.

## Symptom

`prepareTransfer` on a fresh account fails:

```
Gasless deploy-inside-initCode is unsupported on the v0.22.0 factory: createAccount direct
mode requires msg.sender == owner, but initCode runs as the EntryPoint. Pre-deploy the
account first (deployAndWireValidator with the owner wallet), then submit the gasless op.
```

Yet the transfer page tells the user "*[the account will] be deployed automatically with your
first transaction*" (transfer/page.tsx). So a new user is told it just works, but the first
transfer reverts at prepare time — a broken onboarding path.

## Root cause 1 — creation uses the LEGACY path, not v0.23 passkey-at-birth

`components/CreateAccountDialog.tsx` calls **`accountAPI.createWithP256Guardians`** (and
`createWithGuardians`). Per `account.service.ts`, that single-shot endpoint is the **LEGACY
path — Tier-1 only, no owner device passkey at birth, account NOT deployed** (counterfactual).

The backend already exposes the **v0.23 passkey-at-birth** flow —
`prepareCreateWithPasskey` → `navigator.credentials.get(publicKeyOptions)` →
`submitCreateWithPasskey` (deployer relay) — which sets the owner device passkey + validator
**and deploys the account at birth**. It's what the live DEMO (v0.23.0) used. **The creation
UI never calls it.** So YAAA still ships legacy undeployed accounts, which then can't
deploy-on-first-transfer on the v0.22 factory.

## Root cause 2 — creation ignores `initialTokenConfigs` (no default tiers)

The SDK's `buildInitConfig` (`BuildInitConfigParams`) **fully supports `initialTokens` +
`initialTokenConfigs`** — per-token `{ tier1Limit, tier2Limit, dailyLimit }`. YAAA's create
flow passes **only a single global `dailyLimit`**, never `initialTokenConfigs`, so T1/T2/T3
tier limits are 0 at birth. That forces the separate `app/tier-setup` step — which runs its
calls **through PaymasterV4 (aPNTs)** and explicitly handles `AA33 — no aPNTs`. A brand-new
user with no aPNTs is stuck: can't pre-deploy/raise tiers → can't transfer beyond the default.

## Fix plan

1. **Switch creation to passkey-at-birth (fixes the deploy wall).** In `CreateAccountDialog`,
   replace the `createWithP256Guardians` call with `prepareCreateWithPasskey` →
   `navigator.credentials.get(publicKeyOptions)` → `submitCreateWithPasskey` (add the two
   `api.ts` wrappers). Accounts deploy + wire at birth → first transfer works, no tier-setup
   pre-deploy needed. (Deployer relay already funded — the DEMO used it.)
2. **Bake default tiers via `initialTokenConfigs`** (create-with-default). Have the create DTO
   accept per-token tier configs (or sensible defaults) and pass them into `buildInitConfig`,
   so a new account is T1/T2/T3-ready without the aPNTs-gated tier-setup for the common case.
3. **De-risk tier-setup** regardless: offer a self-pay (ETH gas) fallback so it doesn't hard
   depend on aPNTs/PaymasterV4.

Priority: **#1 is the beta blocker** (broken first transfer). #2/#3 remove the aPNTs deadlock.

## Verify on cos72

Register a brand-new account on cos72 → attempt a transfer. If it errors at prepare / demands
tier-setup, this bug is live for beta users. (The e2e path reproduced it against a master build.)

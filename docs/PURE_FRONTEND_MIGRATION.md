# YAA → Pure Frontend (Zero-Backend) Migration

**Branch:** `refactor/pure-frontend` (off `feat/tier3-production-webauthn`)
**Goal:** incrementally remove the NestJS backend (`aastar/`) so YAA becomes a
**pure client-side app** — no server, no server-held secrets, no server DB — that can
then be packaged as a **Chrome extension (MV3)**, a **React Native** app, or a
**single-file embeddable widget**.

Target confirmed: **true zero-backend** (not an edge-proxy compromise).

---

## Why this is possible

The frontend already talks to `@aastar/sdk` directly in ~29 places
(`core` / `airaccount` / `kms` / `tokens` / `operator`). Most backend modules are thin
orchestration over that same SDK + the remote KMS / BLS / bundler / Paymaster
services. The backend is mostly a **trusted secret-holder + JSON store**, not
irreplaceable logic.

---

## Hard constraints (server-only secrets) and their zero-backend resolution

| Secret / server role | Today | Zero-backend resolution |
|---|---|---|
| `KMS_API_KEY` | injected server-side by `app/kms-api/[...path]/route.ts` | KMS already does **Origin allow-listing** (dev-rpid board matches `https://*.aastar.io`). Move to a **browser-direct KMS client** authorized by Origin; drop the key-injecting route. |
| `PIMLICO_API_KEY` (bundler) | backend calls Pimlico | Use a **public / SuperPaymaster-sponsored bundler endpoint**, or an origin-scoped key. No secret in the bundle. |
| `JWT_SECRET`, `USER_ENCRYPTION_KEY` | backend session + at-rest encryption | Auth root becomes the **passkey / KMS** itself (WebAuthn assertion = session proof). Client-side encryption keyed off the passkey/KMS, not a server secret. |
| `RESEND_API_KEY` (email OTP) | backend sends OTP | Drop email/OTP login in the pure-frontend build (passkey is primary), or use a serverless email provider with a public form endpoint. |
| DB (`JsonAdapter` / Postgres) | server file/Postgres | Move user-scoped state (address book, saved paymasters, tx history cache, default-paymaster) to **IndexedDB / localStorage**. On-chain + SDK are the source of truth. |
| dev EOAs (`PRIVATE_KEY*`, `ETH_PRIVATE_KEY`) | test signing | Not needed in a production frontend build. |

If any single constraint can't be met (e.g. a bundler that *requires* a secret key),
that becomes the one explicitly-tracked exception — surfaced here, not silently kept.

---

## Backend module inventory → destination

Frontend-facing (must be replaced): **auth, account, transfer, paymaster, bls,
guardian, token, address-book**.

| Module | Frontend endpoints | Destination |
|---|---|---|
| `address-book` | `/address-book*` | IndexedDB (client) |
| `token` / `user-token` | `/tokens/*` | `@aastar/sdk/tokens` + client cache |
| `paymaster` | `/paymaster/*` | `@aastar/sdk` + canonical addresses (partly client already) |
| `bls` | `/bls/*` | direct to BLS gossip network (already a remote service) |
| `account` | `/account/*` | `@aastar/sdk/airaccount` (create/nonce/balance) |
| `transfer` | `/transfer/*` | `@aastar/sdk` (device-passkey path is already half client-side) |
| `guardian` | `/guardian/*` | `@aastar/sdk/airaccount` guardian APIs |
| `auth` | `/auth/*` | passkey/KMS-rooted client session |
| `admin`/`operator`/`sale`/`registry`/`community`/`data-tools`/`email`/`user-nft` | (operator/admin surfaces) | out of scope for the enduser pure-frontend build; keep separate or drop |

---

## Incremental extraction order (low-risk first, one PR each)

1. **address-book + tokens** — read-mostly, client storage + SDK. Lowest risk; proves the pattern.
2. **paymaster** — list/presets/sponsor via SDK + canonical (we just refactored this UI).
3. **account + bls** — creation/nonce/balance + BLS node fetch via SDK.
4. **transfer** — full client-side orchestration (device-passkey path already client-side).
5. **guardian** — recovery flows via SDK.
6. **auth** — replace JWT-from-backend with passkey/KMS-rooted session; retire `/api` proxy.
7. **KMS route** — replace `app/kms-api` server route with a browser-direct, Origin-authorized KMS client. Remove `next.config` `rewrites()` to the backend.
8. **Delete `aastar/`** from the enduser runtime; flip frontend to `output: 'export'` (static). This is the deferred static-export step.

Each step: a module moves to client, the corresponding `lib/api.ts` calls are replaced,
the backend endpoint stops being required, tests/gates stay green, no regression.

---

## Packaging end-states (after zero-backend + static export)

- **Chrome extension (MV3):** static assets as the popup/side-panel; passkey + KMS work over `https://` origins; storage via `chrome.storage` / IndexedDB.
- **React Native:** reuse the SDK + client logic; native WebAuthn/passkey APIs.
- **Single-file embeddable widget:** bundle to a self-contained script/iframe a host page can drop in.

---

## Decided: the API-key model (resolves the bundler + KMS constraints)

Each install obtains an **AAStar API key** (free tier with a base service quota; more
usage → paid / buy **aPoints** compute credit). That single key authorizes **both the
bundler and the KMS** from the browser — so the client needs no AAStar-operated backend.

Two ways a user gets bundler/KMS access:
1. **Self-applied free key** — we give them a flow to apply for a free bundler API key
   (e.g. Pimlico) and/or the AAStar key. Free tier is enough for normal use; needs a
   little technical comfort.
2. **Our provided key, configured locally** — the AAStar-issued key (bundler + KMS in one)
   stored client-side.

**KMS is not AAStar-only.** Any community can run a KMS. A user authorizes against a
community's KMS via an **API key or an SBT identity**: they bind + verify their wallet
address, and subsequent transactions from that address are authorized by that KMS before
they reach chain (KMS allows → allowed). So both bundler and KMS auth are keyed to the
user's own credential, not a shared server secret.

Implications for the constraint table above:
- `KMS_API_KEY` / `PIMLICO_API_KEY` → **replaced by the user's own API key** (free tier
  or provided), held client-side and scoped to their wallet/community identity. No shared
  secret ships in the bundle.

## Remaining open questions

1. **Auth model:** passkey assertion as the only session root — do we need any server-issued token at all, or is on-chain + KMS sufficient?
2. **Operator/admin surfaces:** keep as a separate (backend-having) app, or drop from the enduser build?
3. **API-key onboarding UX:** where the key is applied for / entered / stored (settings screen), and quota/aPoints upsell flow.

---

## Status

- [x] Branch created, migration plan drafted.
- [x] Step 1a: **address book → client-side store** (`lib/address-book-store.ts`, localStorage, account-scoped). Backend `/address-book*` no longer called; transfer records the recipient client-side on confirmation. (backend module left in place; deleted in step 8)
- [ ] Step 1b: tokens → `@aastar/sdk/tokens` + client cache.
- [ ] … (steps 2–8)

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

## Open questions (to resolve before/while extracting)

1. **Bundler:** confirm a public / SuperPaymaster-sponsored bundler endpoint usable from the browser without a secret key.
2. **KMS browser-direct auth:** confirm the production KMS (not just the dev-rpid board) authorizes browser Origin without the server `KMS_API_KEY`.
3. **Auth model:** passkey assertion as the only session root — do we need any server-issued token at all, or is on-chain + KMS sufficient?
4. **Operator/admin surfaces:** keep as a separate (backend-having) app, or drop from the enduser build?

---

## Status

- [x] Branch created, migration plan drafted.
- [ ] Step 1: address-book + tokens → client storage + SDK.
- [ ] … (steps 2–8)

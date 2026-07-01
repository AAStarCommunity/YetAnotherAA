# YAA → Pure Frontend (Zero-Backend) Migration

**Branch:** `refactor/pure-frontend` (off `feat/tier3-production-webauthn`)
**Goal:** incrementally remove the NestJS backend (`aastar/`) so YAA becomes a
**pure client-side app** — no server, no server-held secrets, no server DB —
that can then be packaged as a **Chrome extension (MV3)**, a **React Native**
app, or a **single-file embeddable widget**.

Target confirmed: **true zero-backend** (not an edge-proxy compromise).

---

## Status: 🟡 WIP — PAUSED (2026-07-01)

The **storage-class migrations** and the **frontend foundation prep** are done
(~25% overall). Everything left is the **KMS/auth-rooted core** (auth, account,
transfer, guardian) and depends on **KMS/bundler infra changes that don't exist
yet** (see
[Infra requirements](#infra-requirements-blocking--for-the-kms--bundler-teams)).
The remaining work is large, so this branch is **paused**: resume once the infra
lands and other priorities clear. Branch `refactor/pure-frontend` / draft PR
#400 stay open.

**Progress**

| Area                                                                  |        % | Note                                     |
| --------------------------------------------------------------------- | -------: | ---------------------------------------- |
| Storage-class data (address book, token balance/list, paymaster list) |     ~85% | localStorage / on-chain; done            |
| Frontend foundation prep (API-key store, KMS-direct seam, Settings)   |     done | not yet wired into flows                 |
| KMS/auth foundation (Origin-direct + API-key + passkey session)       |     ~15% | prep only; blocked on infra              |
| Core path (auth / account / transfer / guardian)                      |      ~5% | 0 flows moved; blocked                   |
| Delete `aastar/` + `output:'export'`                                  |       0% | final step                               |
| **Overall toward true zero-backend**                                  | **~25%** | app still cannot run without the backend |

### Done (this branch)

| Commit  | What                                                                        |
| ------- | --------------------------------------------------------------------------- |
| step 1a | Address book → `lib/address-book-store.ts` (localStorage, per-account)      |
| step 1b | Token balance → `lib/token-balance.ts` (viem on-chain read)                 |
| step 1c | User token list → `lib/user-token-store.ts` (localStorage)                  |
| step 2  | Paymaster saved-list + presets → `lib/paymaster-store.ts`                   |
| step 3  | Dead `blsAPI` removed                                                       |
| prep    | `lib/api-key-store.ts` + `lib/kms-client.ts` seam + `app/settings/page.tsx` |

Removed from `lib/api.ts`: `addressBookAPI`, `userTokenAPI`, `paymasterAPI`,
`blsAPI`, `tokenAPI.getTokenBalance`.

### Left to do (ordered — foundation first)

1. **Infra** (other teams — see below): KMS Origin trust for non-`aastar.io`
   shells + production per-user-API-key auth + CORS; same for the bundler.
2. **Wire direct-KMS** in the frontend (the `lib/kms-client.ts` seam) once infra
   is live; retire `app/kms-api`.
3. **Auth root**: passkey/KMS session instead of backend JWT.
4. **account** (`getAccount` via client-side address derivation + create),
   **transfer** (client-side KMS sign + BLS + paymaster + bundler), **guardian**
   recovery.
5. Delete `aastar/`; flip `output: 'export'`; package (Chrome MV3 / RN /
   single-file).

---

## Infra requirements (blocking — for the KMS / bundler teams)

To let the browser talk to KMS/bundler **directly** (true zero-backend), the
following must exist on the service side. These are **not** frontend edits.

1. **KMS Origin trust (rp.id / allowed-origins).** KMS resolves rp.id and runs
   an allowed-origin check from the request Origin. Today it trusts
   `https://*.aastar.io` (so `cos72.aastar.io` already works via rpId
   `aastar.io`). For other shells the Origin must be added: **Chrome extension**
   (`chrome-extension://<id>`), **local/dev** (`http://localhost:*`), **other
   communities' own domains**. — _This is the part the team already understands;
   it's necessary but not sufficient._
2. **KMS accepts a per-user API key from the browser in PRODUCTION.** Today the
   browser goes through the server-side `/kms-api` proxy, which injects the
   shared `KMS_API_KEY`; a client-supplied `x-api-key` is honored **only outside
   production**. For direct calls the production KMS must authorize a **user's
   own API key** (free tier / provided) or an **SBT identity bound to their
   wallet address**. Without this, the browser cannot reach production KMS
   without the server proxy.
3. **KMS CORS.** Direct browser→KMS is cross-origin; KMS must return CORS
   headers allowing the app Origin (`Access-Control-Allow-Origin` + preflight).
   Via the same-origin proxy this isn't needed; direct calls require it. (Our
   `Settings → Test KMS connection` probe will keep failing until this is
   enabled — that failure is the readiness signal.)
4. **Bundler: same two.** Direct browser→bundler must accept the user's key (not
   expose a shared `PIMLICO_API_KEY`) and send CORS headers — or provide a
   public/sponsored endpoint usable from the browser.
5. **API-key onboarding.** A flow for a user to obtain a free-tier key
   (self-apply or provided), with paid / aPoints upgrade for higher volume. The
   frontend already has the input (`Settings`) + storage
   (`lib/api-key-store.ts`); it needs a real key to store.

Until 1–4 exist, the core flows stay on the backend and the migration cannot
proceed past the foundation prep.

---

## Why this is possible

The frontend already talks to `@aastar/sdk` directly in ~29 places (`core` /
`airaccount` / `kms` / `tokens` / `operator`). Most backend modules are thin
orchestration over that same SDK + the remote KMS / BLS / bundler / Paymaster
services. The backend is mostly a **trusted secret-holder + JSON store**, not
irreplaceable logic.

---

## Hard constraints (server-only secrets) and their zero-backend resolution

| Secret / server role                         | Today                                                    | Zero-backend resolution                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KMS_API_KEY`                                | injected server-side by `app/kms-api/[...path]/route.ts` | KMS already does **Origin allow-listing** (dev-rpid board matches `https://*.aastar.io`). Move to a **browser-direct KMS client** authorized by Origin; drop the key-injecting route. |
| `PIMLICO_API_KEY` (bundler)                  | backend calls Pimlico                                    | Use a **public / SuperPaymaster-sponsored bundler endpoint**, or an origin-scoped key. No secret in the bundle.                                                                       |
| `JWT_SECRET`, `USER_ENCRYPTION_KEY`          | backend session + at-rest encryption                     | Auth root becomes the **passkey / KMS** itself (WebAuthn assertion = session proof). Client-side encryption keyed off the passkey/KMS, not a server secret.                           |
| `RESEND_API_KEY` (email OTP)                 | backend sends OTP                                        | Drop email/OTP login in the pure-frontend build (passkey is primary), or use a serverless email provider with a public form endpoint.                                                 |
| DB (`JsonAdapter` / Postgres)                | server file/Postgres                                     | Move user-scoped state (address book, saved paymasters, tx history cache, default-paymaster) to **IndexedDB / localStorage**. On-chain + SDK are the source of truth.                 |
| dev EOAs (`PRIVATE_KEY*`, `ETH_PRIVATE_KEY`) | test signing                                             | Not needed in a production frontend build.                                                                                                                                            |

If any single constraint can't be met (e.g. a bundler that _requires_ a secret
key), that becomes the one explicitly-tracked exception — surfaced here, not
silently kept.

---

## Backend module inventory → destination

Frontend-facing (must be replaced): **auth, account, transfer, paymaster, bls,
guardian, token, address-book**.

| Module                                                                           | Frontend endpoints        | Destination                                                             |
| -------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `address-book`                                                                   | `/address-book*`          | IndexedDB (client)                                                      |
| `token` / `user-token`                                                           | `/tokens/*`               | `@aastar/sdk/tokens` + client cache                                     |
| `paymaster`                                                                      | `/paymaster/*`            | `@aastar/sdk` + canonical addresses (partly client already)             |
| `bls`                                                                            | `/bls/*`                  | direct to BLS gossip network (already a remote service)                 |
| `account`                                                                        | `/account/*`              | `@aastar/sdk/airaccount` (create/nonce/balance)                         |
| `transfer`                                                                       | `/transfer/*`             | `@aastar/sdk` (device-passkey path is already half client-side)         |
| `guardian`                                                                       | `/guardian/*`             | `@aastar/sdk/airaccount` guardian APIs                                  |
| `auth`                                                                           | `/auth/*`                 | passkey/KMS-rooted client session                                       |
| `admin`/`operator`/`sale`/`registry`/`community`/`data-tools`/`email`/`user-nft` | (operator/admin surfaces) | out of scope for the enduser pure-frontend build; keep separate or drop |

---

## Incremental extraction order (low-risk first, one PR each)

1. **address-book + tokens** — read-mostly, client storage + SDK. Lowest risk;
   proves the pattern.
2. **paymaster** — list/presets/sponsor via SDK + canonical (we just refactored
   this UI).
3. **account + bls** — creation/nonce/balance + BLS node fetch via SDK.
4. **transfer** — full client-side orchestration (device-passkey path already
   client-side).
5. **guardian** — recovery flows via SDK.
6. **auth** — replace JWT-from-backend with passkey/KMS-rooted session; retire
   `/api` proxy.
7. **KMS route** — replace `app/kms-api` server route with a browser-direct,
   Origin-authorized KMS client. Remove `next.config` `rewrites()` to the
   backend.
8. **Delete `aastar/`** from the enduser runtime; flip frontend to
   `output: 'export'` (static). This is the deferred static-export step.

Each step: a module moves to client, the corresponding `lib/api.ts` calls are
replaced, the backend endpoint stops being required, tests/gates stay green, no
regression.

---

## Packaging end-states (after zero-backend + static export)

- **Chrome extension (MV3):** static assets as the popup/side-panel; passkey +
  KMS work over `https://` origins; storage via `chrome.storage` / IndexedDB.
- **React Native:** reuse the SDK + client logic; native WebAuthn/passkey APIs.
- **Single-file embeddable widget:** bundle to a self-contained script/iframe a
  host page can drop in.

---

## Decided: the API-key model (resolves the bundler + KMS constraints)

Each install obtains an **AAStar API key** (free tier with a base service quota;
more usage → paid / buy **aPoints** compute credit). That single key authorizes
**both the bundler and the KMS** from the browser — so the client needs no
AAStar-operated backend.

Two ways a user gets bundler/KMS access:

1. **Self-applied free key** — we give them a flow to apply for a free bundler
   API key (e.g. Pimlico) and/or the AAStar key. Free tier is enough for normal
   use; needs a little technical comfort.
2. **Our provided key, configured locally** — the AAStar-issued key (bundler +
   KMS in one) stored client-side.

**KMS is not AAStar-only.** Any community can run a KMS. A user authorizes
against a community's KMS via an **API key or an SBT identity**: they bind +
verify their wallet address, and subsequent transactions from that address are
authorized by that KMS before they reach chain (KMS allows → allowed). So both
bundler and KMS auth are keyed to the user's own credential, not a shared server
secret.

Implications for the constraint table above:

- `KMS_API_KEY` / `PIMLICO_API_KEY` → **replaced by the user's own API key**
  (free tier or provided), held client-side and scoped to their wallet/community
  identity. No shared secret ships in the bundle.

## Remaining open questions

1. **Auth model:** passkey assertion as the only session root — do we need any
   server-issued token at all, or is on-chain + KMS sufficient?
2. **Operator/admin surfaces:** keep as a separate (backend-having) app, or drop
   from the enduser build?
3. **API-key onboarding UX:** where the key is applied for / entered / stored
   (settings screen), and quota/aPoints upsell flow.

---

## Status

- [x] Branch created, migration plan drafted.
- [x] Step 1a: **address book → client-side store**
      (`lib/address-book-store.ts`, localStorage, account-scoped). Backend
      `/address-book*` no longer called; transfer records the recipient
      client-side on confirmation. (backend module left in place; deleted in
      step 8)
- [x] Step 1b: **token balance → client-side on-chain read**
      (`lib/token-balance.ts`, viem `erc20Abi` balanceOf/decimals/symbol/name).
      The only used token endpoint was `getTokenBalance`; transfer +
      DashboardContext now read on-chain (verified live on Sepolia).
      `getTokenBalance` removed from `lib/api.ts`. The user's saved-token _list_
      (`userTokenAPI`) is still backend — separate step.
- [x] Step 1c: **user-token list → client-side store**
      (`lib/user-token-store.ts`, localStorage, account-scoped). getUserTokens /
      addUserToken / initializeDefaultTokens are client-side; custom-token
      metadata resolves on-chain (`getTokenMetadata`); balances attach via step
      1b; defaults mirror the old PRESET_TOKENS. `userTokenAPI` removed. (Note:
      presets are Optimism contracts — a pre-existing chain mismatch preserved
      as-is.)
- [x] Step 2 (list): **paymaster saved-list + presets → client-side**
      (`lib/paymaster-store.ts`, localStorage account-scoped list; presets built
      from SDK canonical). `paymasterAPI` removed. NOTE: `paymasterAPI.sponsor`
      was unused and the transfer backend sponsors from the passed
      `paymasterAddress`, so sponsorship itself still runs server-side and moves
      client-side with the transfer flow (step 4).
- [x] Step 3 (bls cleanup): **`blsAPI` removed** — the frontend never called it;
      BLS runs inside the backend transfer flow and moves client-side (direct to
      the gossip network) with the transfer migration.

### Re-planning note (after finishing the storage-class migrations)

The cleanly-separable work (localStorage stores + on-chain reads) is now done:
**address book, token balance, token list, paymaster list**. Everything left —
**account (`getAccount` / create), transfer signing, guardian recovery** — is
**KMS/auth-rooted**: the account address and every signature derive from the
user's KMS key via the backend's `resolveKmsKey(userId)` signer. They cannot
move to the browser until the **KMS/auth foundation** exists.

So the original order (account → transfer → guardian → auth → KMS) is
**inverted**: the foundation must come first.

**Revised order:**

1. ✅ Storage-class: address book / token balance+list / paymaster list (done);
   BLS dead-API removed.
2. **KMS Origin-direct + the API-key model** (was step 7) — browser talks to KMS
   with the user's API key / SBT identity; retire the `app/kms-api`
   key-injecting route.
3. **Auth root** (was step 6) — passkey/KMS session instead of backend JWT.
4. On that foundation: **account** (client-side address derivation + create),
   **transfer** (client-side KMS sign + BLS + paymaster + bundler),
   **guardian**.
5. Delete `aastar/`; flip `output: 'export'`.

Step 2 (KMS/auth foundation) needs the real KMS Origin-auth + API-key infra to
be live (the open questions above) — it's a backend/infra dependency, not just a
frontend edit.

**Foundation prep (frontend-only, done ahead of the infra — non-breaking, not
yet wired):**

- `lib/api-key-store.ts` — holds the user's AAStar API key + optional
  KMS/bundler endpoint overrides in localStorage.
- `lib/kms-client.ts` (extended) — a direct-KMS seam: `kmsBaseUrl()`,
  `isDirectKmsReady()`, `directKmsClient()` (wires the existing `KmsClient` to
  the user's key), `pingKms()`. Auth/transfer flows still use the `/kms-api`
  proxy until the KMS Origin+API-key path is live.
- `app/settings/page.tsx` — enter/save/clear the API key + endpoint overrides,
  test KMS connectivity, show direct-ready status (linked from the avatar menu).
  `pingKms` will CORS-fail until KMS allows the browser Origin — expected, and
  is itself the readiness signal.
- Note: `lib/auth.ts` already centralizes the JWT
  (getStoredAuth/setStoredAuth/clear) — no convergence needed there.

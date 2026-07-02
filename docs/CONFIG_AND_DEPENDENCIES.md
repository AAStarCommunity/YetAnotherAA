# YAA — Config, Resources, Keys & Dependencies Inventory

> What YetAnotherAA actually depends on: secrets/private keys, endpoints/services, chain
> config. Feeds two things: (1) **beta security hygiene** (dev keys must not ship), and
> (2) the **zero-backend / decentralization** design — which of these can be user-configured
> ("use AAStar's or your own") vs which must be *eliminated* (relay + API-key model).
> Date: 2026-07-02. Source: `aastar/.env` + `aastar-frontend/.env.local` + code.

Disposition legend for the zero-backend target:
- 🔴 **Eliminate** — a server-only secret; remove via the relay + API-key model (never in a browser).
- 🟢 **User-configurable endpoint** — AAStar default OR the user's own (decentralization choice).
- 🟡 **Dev/test only** — must NOT be present in a production/beta build.
- ⚙️ **App/runtime flag** — non-secret configuration.

## 1. Secrets & private keys (backend `aastar/.env`)

| Key | Purpose | Disposition |
|---|---|---|
| `JWT_SECRET` | signs the app session JWT | 🔴 → auth root becomes passkey/KMS session (drop server JWT) |
| `USER_ENCRYPTION_KEY` | AES-256 at-rest encryption (32 chars) | 🔴 → client-side encryption keyed off passkey/KMS |
| `KMS_API_KEY` | KMS access (injected by the `/kms-api` proxy) | 🔴 → replaced by the **user's own API key** (direct KMS) |
| `PIMLICO_API_KEY` | ERC-4337 bundler | 🔴 → user's key / public/sponsored bundler |
| `DEPLOYER_PRIVATE_KEY` (config `deployerPrivateKey`; not in current .env — maps from `ETH_PRIVATE_KEY` or unset) | relays passkey **account deploy** (`submitCreateWithPasskey`) | 🔴 → **AAStar relay service** (see `RELAY_SERVICE_PROPOSAL.md`) |
| `ETH_PRIVATE_KEY` | relays **recovery** `executeRecovery()` on-chain | 🔴 → relay service (same pattern as deploy) |
| `RESEND_API_KEY` | email OTP send | 🔴/drop → OTP optional; passkey is primary |
| `ETHERSCAN_API_KEY` | explorer lookups | 🟢 optional / user-configurable |
| `TELEGRAM_BOT_TOKEN` | ops liveness alerts (monitor) | 🔴 ops-only (never client) |
| `DATA_TOOLS_PASSWORD` | `/data-tools` admin gate | 🔴 admin-only |
| `PRIVATE_KEY`, `PRIVATE_KEY_{JASON,ANNI,BOB,BROWN,CHARLIE,JACK,SUPPLIER}`, `TEST_PRIVATE_KEY` | **test EOAs** for L1 scripts | 🟡 **dev-only — must not ship to beta/prod** |
| `BLS_TEST_PRIVATE_KEY_1/2` (+ node ids/pubkeys) | BLS test-node keys | 🟡 dev-only |

> Beta gate: confirm the 🟡 dev keys are absent from any deployed `.env` (readiness DoD #8:
> "codebase secret scan clean"). The 🔴 set is what the relay + API-key model removes.

## 2. Endpoints / external services (🟢 user-configurable in the zero-backend model)

| Config | Service | AAStar default | Self-config? |
|---|---|---|---|
| `ETH_RPC_URL` / `SEPOLIA_RPC_URL{,2,3}` / `RPC_URL` | chain RPC | publicnode / infura | 🟢 own RPC |
| `BUNDLER_RPC_URL` / `PIMLICO_BUNDLER_URL` / `CANDIDE_BUNDLER_URL` | ERC-4337 bundler | Pimlico (via key) | 🟢 own bundler |
| `KMS_BASE_URL` / `KMS_ENDPOINT` / `KMS_PROXY_URL` / `NEXT_PUBLIC_KMS_URL` | KMS (WebAuthn ceremonies + signing) | `kms.aastar.io` / `kms1.aastar.io` | 🟢 own/community KMS |
| BLS signer network (`NEXT_PUBLIC_BLS_SEED_NODE`, DVT nodes) | BLS aggregate signatures | `yetanotheraa-validator.onrender.com`, `dvt1/2/3.aastar.io` | 🟢 own signer set |
| (proposed) `RELAY_URL` | account-deploy relay | `relay.aastar.io` / SuperRelay | 🟢 own relayer |
| `BACKEND_API_URL` / `NEXT_PUBLIC_API_URL` | app backend (goes away in zero-backend) | `127.0.0.1:3000` | n/a (removed) |

> **Decentralization choice (user request):** every 🟢 row is "AAStar default **or** your own".
> The client already supports KMS/bundler URL overrides (`lib/api-key-store.ts`, on the
> migration branch); the config page extends this to RPC + RELAY. Blank = AAStar default;
> filled = self-hosted. Code supports self-config; AAStar defaults are a convenience, not a lock-in.

## 3. Chain / contracts (⚙️ mostly canonical, not secrets)

~148 `*_ADDRESS` / `*_FACTORY` / `CHAIN_ID` / `ENTRY_POINT_*` / `VALIDATOR_*` / `AIRACCOUNT_*` /
`PAYMASTER_*` vars. Most resolve from **`@aastar/sdk` canonical** (`getCanonicalAddresses(chainId)`);
`.env` only overrides. Includes: EntryPoint v0.6/0.7/0.8, AAStar account factory/impl/extension,
validator router, BLS aggregator, SuperPaymaster, PaymasterV4, registry, GToken, aPNTs. Per-chain
(Sepolia now; Optimism mainnet for the phase-2 release).

## 4. Runtime flags (⚙️)

`NODE_ENV`, `PORT`, `NETWORK`, `CHAIN_ID`, `KMS_ENABLED`, `DB_TYPE` (json/postgres),
`DEFAULT_ENTRYPOINT_VERSION`.

## 5. Summary — what the zero-backend + relay design does to this list

- **🔴 secrets → eliminated** from the app: KMS/bundler via the **user's API key**; account-deploy
  + recovery via the **AAStar relay service** (billed in aPNTs); JWT/encryption via a
  passkey/KMS-rooted client session. No private key in the app/browser.
- **🟢 endpoints → user-configurable**: RPC / KMS / bundler / relay — AAStar default or self-hosted
  (the decentralization choice), surfaced in the config page.
- **🟡 dev keys → must be stripped** before beta (security hygiene).
- **⚙️ chain/contracts → canonical from the SDK**, per-network.

This is the config target the config-center page (`app/settings`) manages: **endpoints + the
user's own API key only — never private keys.**

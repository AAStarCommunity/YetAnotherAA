# Proposal: replace the deployer private key with an AAStar Relay Service

> Remove the app-side `DEPLOYER_PRIVATE_KEY` used to relay passkey account creation, and
> move it to an **AAStar-operated relay service (API URL)** that deploys on the user's
> behalf, billed in **aPNTs** (or online-payment → admin auto-provision) so onboarding is
> invisible to the user. Aligns with the API-key model + the zero-backend migration.
> Status: proposal for review. Date: 2026-07-02.

---

## 1. The problem

KMS-relay account creation (`account.service.ts::submitCreateWithPasskey`) builds a
`deployerWallet` from an app-held **`DEPLOYER_PRIVATE_KEY`** (+ `ETH_RPC_URL`) and sends the
deploy tx itself (`msg.sender = deployer`), while the account is owned by the user's
KMS passkey. See [KMS-relay creation mode context] in earlier notes.

Why this is bad for beta/production:
- **Users don't have / understand a private key** — the whole point of passkey onboarding.
- **App operators won't (and shouldn't) embed a funded private key in the app** — custody
  + security liability, and impossible in a pure-frontend / Chrome-extension shell.
- **Blocks zero-backend** — `DEPLOYER_PRIVATE_KEY` is the last server-only secret on the
  account path (alongside KMS/bundler keys already covered by the API-key model).
- **Ops burden** — someone must fund + rotate + monitor that deployer EOA per deployment.

## 2. The proposal — Relay-as-a-Service

An **AAStar-operated relay endpoint** (extend **SuperRelay**, the existing ERC-4337 bundler
gateway, or a sibling `relay.aastar.io`) that deploys accounts on behalf of users:

```
POST {RELAY_URL}/deploy-account
  headers: x-api-key: <user's AAStar key>          # same key model as KMS/bundler
  body:    { createId | preparedCreateAccount, webAuthnAssertion }
  → relay's OWN funded deployer sends the deploy tx (msg.sender = AAStar deployer)
  → { address, deployTxHash, deployed: true }
```

- The **deployer key lives only inside the relay service** (AAStar infra), never in the app.
- Authorized by the **API-key model** (free-tier key or SBT identity bound to the wallet) —
  the same credential that authorizes KMS + bundler in the zero-backend design.
- The app change is small: `submitCreateWithPasskey` stops building a local `deployerWallet`
  and instead POSTs the prepared-create + assertion to `RELAY_URL`. **No private key in the app.**

## 3. Billing — how AAStar gets paid (charge aPNTs)

The relay deducts the **deploy gas cost + margin in aPNTs** from the user, mirroring how
gasless *transfers* already charge aPNTs via the Paymaster:

- Relay computes the deploy cost, debits the user's **aPNTs** balance (via SuperPaymaster's
  aPNTs accounting), then relays. Account creation becomes "spend a little aPNTs" — no ETH.

**Chicken-and-egg** (a brand-new user has 0 aPNTs and no account to hold them):

| Option | How | UX | Cost to AAStar |
|---|---|---|---|
| **A. First deploy sponsored** | AAStar eats the first account deploy (cheap on L2), then charges aPNTs for every op afterward | Best — pure "Face ID → account" | 1 cheap deploy per new user |
| **B. Online-payment-first** | User pays (USDC/fiat) → aPNTs credited → account auto-created | Invisible after payment; the **admin auto-provision** path | none (user pays) |
| **C. Sponsor pays** | A community/operator pre-funds deploys for its members | Invisible to member | borne by the community |

Recommended: **A for consumer onboarding** (loss-leader, deploy is cheap), **B for paid
tiers / higher volume**, **C for community-led onboarding**. All three keep the user unaware
of gas/keys.

### Admin auto-provision (the "invisible" path, option B)
On confirmed payment, an admin/relay flow auto-provisions: **create account (relay) + credit
aPNTs**, so the user just pays once and gets a ready, funded-with-points account. This is a
thin server/relay flow, not app-side.

## 4. What changes where

| Layer | Change |
|---|---|
| **AAStar Relay Service** (new/SuperRelay) | `POST /deploy-account`: API-key auth, funded deployer, aPNTs debit, returns account+tx. Holds the deployer key. |
| **SuperPaymaster / aPNTs** | account-deploy becomes an aPNTs-charged operation (new debit reason), + the sponsor/first-free policy. |
| **App backend (interim) / frontend (target)** | `submitCreateWithPasskey` → POST to `RELAY_URL` instead of local `deployerWallet`. Drop `DEPLOYER_PRIVATE_KEY`. |
| **Config** | `RELAY_URL` joins KMS/bundler URLs in the client config (Settings page). No secret. |
| **Onboarding UX** | applications never see gas or keys; new users get option A/B/C. |

## 5. Phased rollout (matches the beta plan)

1. **Now / beta:** keep the backend `submitCreateWithPasskey` + `DEPLOYER_PRIVATE_KEY`
   (it works, on-chain verified) — but treat the key as **operator infra**, documented, not
   in the client. Add the `RELAY_URL` config seam.
2. **Relay service MVP** (AAStar infra): `POST /deploy-account` with API-key auth + a funded
   deployer, **option A (first-deploy sponsored)**. App switches to it → drop the app key.
3. **aPNTs billing + admin auto-provision** (option B) for paid volume.
4. **Zero-backend:** browser/extension calls `relay.aastar.io` directly with the user key —
   removes the last app-side secret and unblocks the account path of the pure-frontend
   migration.

## 6. Open questions (for the KMS / SuperRelay / SuperPaymaster teams)

- Does SuperRelay already expose (or can it) a `deploy-account` relay, or is a new service needed?
- aPNTs debit for a *deploy* (not a UserOp) — does SuperPaymaster's accounting support an
  arbitrary off-UserOp debit, or does the deploy need to be wrapped as a sponsored UserOp?
- First-deploy-sponsored abuse controls (per-key/per-identity deploy quota).
- API-key issuance + aPNTs top-up flow (ties into the API-key onboarding open question in
  `PURE_FRONTEND_MIGRATION.md`).

---

## Related: centralized config management page

Separate ask — a single page to manage YAA's endpoint config (RPC / KMS / bundler / relay).
This already exists in seed form: **`app/settings/page.tsx`** (API key + KMS/bundler URL
overrides, from the migration foundation prep). Extend it to also hold **RPC URL** and the
new **`RELAY_URL`**.

**Important boundary:** a client-side config page must hold **endpoints + the user's API key
only — never private keys**. The current app-side secrets (`DEPLOYER_PRIVATE_KEY`,
`ETH_PRIVATE_KEY` for recovery relayer, `KMS_API_KEY`) cannot safely live in a browser page;
the correct fix is this proposal (relay service) + the API-key model, which *eliminates*
app-side keys rather than surfacing them in a UI. For operator/admin server config
(contract addresses, chain), a separate server-side admin config screen is the right home.

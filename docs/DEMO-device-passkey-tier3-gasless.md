# YetAnotherAA · Device-Passkey Tier-3 Gasless Transfer — Live On-Chain Demo

> A real end-to-end run: a user registers with a device passkey (Face ID / fingerprint), gets a
> KMS-custodied smart account created **at birth** with the passkey + validator wired, and sends
> **0.051 ETH holding zero ETH for gas** — the Paymaster sponsors gas from community points (aPNTs).
> Every step below is a **real Sepolia transaction**, verifiable on-chain.

**Network:** Sepolia · **Stack:** `@aastar/sdk@0.34.0` + AirAccount contracts `v0.23.0` + DVT signer network `v1.7.1`
· **Test:** `aastar-frontend/e2e/transfer-tier3.spec.ts` (Playwright, real browser passkey via CDP virtual authenticator) — **1 passed**.

---

## 🔗 The Tier-3 transfer (the headline transaction)

| | |
|---|---|
| **Transaction** | [`0xa275c4aa4870171afaac4e6aa079d99eb6b60e0f34ac330c12915c7ae34e4a94`](https://sepolia.etherscan.io/tx/0xa275c4aa4870171afaac4e6aa079d99eb6b60e0f34ac330c12915c7ae34e4a94) |
| **UserOp hash** | `0x63b826e6d3b5bf0914144e8271cea3efeb45e7582f6649b53d8c3ad54801d36e` |
| **Account (sender)** | [`0x4a8B0f971A3D73a8074117dD0d875F85Fd6Aca59`](https://sepolia.etherscan.io/address/0x4a8B0f971A3D73a8074117dD0d875F85Fd6Aca59) — device-passkey account (v0.23.0), `p256KeyX` injected at birth |
| **Recipient** | [`0x49deFe43E18E1771BB936D32745b91065C2e9Ca6`](https://sepolia.etherscan.io/address/0x49deFe43E18E1771BB936D32745b91065C2e9Ca6) |
| **Amount** | **0.051 ETH** (> Tier-2 ceiling → Tier-3: passkey + BLS + guardian) |
| **Status** | `success = true` |

---

## ⛽ Proof it is genuinely gasless

| Evidence | Value |
|---|---|
| Account ETH balance | funded **0.08** → after **0.029** = exactly **−0.051** (the transfer value only) |
| Gas deducted from account | **0 ETH** — if the account had paid gas the balance would be `< 0.029` |
| `paymaster` field on the UserOp | `0xf3948753ff21D33f6A5f516621FFF245B23efa0e` (non-empty) |
| `actualGasCost` (paid by the Paymaster, not the account) | `0.000749 ETH` |
| Recipient received | **0.051 ETH** |
| Gas funding source | community points (**aPNTs**) pre-deposited into PaymasterV4; the Paymaster pays ETH gas on the user's behalf |

**The user holds zero ETH for gas and still transacts — gas is paid by the Paymaster from aPNTs.** This is the core value of YetAnotherAA.

---

## 🧾 All three UserOps in the run were gasless

The same account also armed its tier limits gaslessly before transferring — every UserOp's gas was sponsored by the Paymaster (`paymaster` non-empty, `success = true`):

| # | Tx | Purpose | actualGasCost (Paymaster-paid) |
|---|---|---|---|
| 1 | [`0x99d0eb1d…`](https://sepolia.etherscan.io/tx/0x99d0eb1d8c20532e54d4625c6198162fa4a4200960478ea590084a8686616ab8) | `setTierLimits` (arming) | 0.000349 ETH |
| 2 | [`0x27fc2b99…`](https://sepolia.etherscan.io/tx/0x27fc2b99f9c534c0274b5b4743c7d77f4762ecccccb77558f17be62ff0239f2e) | `setWeightConfig` (arming) | 0.000337 ETH |
| 3 | [`0xa275c4aa…`](https://sepolia.etherscan.io/tx/0xa275c4aa4870171afaac4e6aa079d99eb6b60e0f34ac330c12915c7ae34e4a94) | **Tier-3 transfer 0.051 ETH → recipient** | 0.000749 ETH |

---

## 🔐 What made the Tier-3 signature valid

```
device-passkey account (owner = KMS TEE; device passkey = on-chain P256 factor)
  → UserOp: execute(recipient, 0.051 ETH)   (guard-wrapped, daily-limit enforced)
  → device passkey signs userOpHash in the browser (WebAuthn, challenge = userOpHash)
  → DVT ownerAuth = the device-passkey assertion (tag 0x02); dvt1/2/3.aastar.io each
      eth_call isValidOwnerAuth → P256-verify against the account's p256KeyX/Y → co-sign
      (no KMS ceremony needed)
  → BLS aggregate (≥2 of 3 nodes) + guardian ECDSA co-sign
  → packCumulativeT3WA (algId 0x0a) → validateUserOp == 0 (ACCEPTED)
  → Paymaster sponsors gas (aPNTs) → EntryPoint → recipient receives 0.051 ETH
```

## 🚀 End-to-end flow (all real, no mocks)

1. **Register** with a device passkey (Face ID / fingerprint) — the passkey pubkey `(x,y)` is captured.
2. **Create account (two-phase, KMS relay):** the KMS owner authorizes a `CREATE_ACCOUNT` digest; a funded backend deployer relays it. The v0.23.0 factory wires the **validator router + owner device passkey at birth** in one tx — no post-deploy setup.
3. **Arm tier limits** (gasless) — Tier-1/2/3 spending ceilings.
4. **Tier-3 transfer** (the transaction above) — device passkey + DVT BLS + guardian, gasless.

Reproduce: run the backend (`KMS_ENABLED=true`, funded `DEPLOYER_PRIVATE_KEY`) + frontend, with the KMS board and DVT nodes online, then `npx playwright test e2e/transfer-tier3.spec.ts`.

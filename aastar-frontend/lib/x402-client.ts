/**
 * x402 payment client — handles EIP-3009 TransferWithAuthorization flow.
 *
 * Flow:
 *   1. POST /tasks → 402 Payment Required
 *   2. Parse Payment-Required header → get payTo + amount
 *   3. Sign EIP-3009 typed data with walletClient
 *   4. Retry POST with Payment-Signature header (base64-encoded JSON)
 *   5. Return { receiptId, receiptUri } on success
 *
 * Graceful degradation: caller should catch errors and fall back to
 * direct on-chain creation when the API is not configured.
 */

import { type WalletClient, type Hex, type Address } from "viem";

// ------------------------------------------------------------------ types

export interface X402TaskPayload {
  title: string;
  description: string;
  rewardAmount: string;
  deadlineDays: number;
  taskType: string;
}

export interface X402Receipt {
  receiptId: Hex;
  receiptUri: string;
}

interface PaymentRequiredScheme {
  asset: Address;
  amount: string;
  payTo: Address;
  extra?: { name?: string; version?: string };
}

interface PaymentRequiredBody {
  accepts?: PaymentRequiredScheme[];
}

// EIP-3009 typed data definition (matches API server)
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ------------------------------------------------------------------ helpers

/** Generate a random 32-byte hex nonce for EIP-3009. */
function randomBytes32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

// ------------------------------------------------------------------ main

/**
 * Posts a task creation request to the x402 API server.
 *
 * Automatically handles the 402 → sign → retry dance.
 * Throws a descriptive Error on any failure.
 *
 * @param apiUrl          Base URL of the x402 API server (e.g. "http://localhost:3401")
 * @param payload         Task fields to POST
 * @param walletClient    viem WalletClient (must be able to signTypedData)
 * @param tokenAddress    ERC-20 token address used for payment
 * @param tokenName       EIP-712 domain `name` of the token (e.g. "USDC")
 * @param tokenVersion    EIP-712 domain `version` of the token (e.g. "2")
 * @param chainId         Current chain ID
 */
export async function postTaskWithX402(
  apiUrl: string,
  payload: X402TaskPayload,
  walletClient: WalletClient,
  tokenAddress: Address,
  tokenName: string,
  tokenVersion: string,
  chainId: number
): Promise<X402Receipt> {
  const addresses = await walletClient.requestAddresses();
  const from = addresses[0];
  const body = JSON.stringify(payload);

  // ── Step 1: initial request (no payment header) ───────────────────────
  const firstRes = await fetch(`${apiUrl}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (firstRes.ok) {
    const data = (await firstRes.json()) as {
      receiptId: Hex;
      receiptUri: string;
    };
    return { receiptId: data.receiptId, receiptUri: data.receiptUri };
  }

  if (firstRes.status !== 402) {
    const err = (await firstRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(err.error ?? `API responded with ${firstRes.status}`);
  }

  // ── Step 2: parse Payment-Required ────────────────────────────────────
  const prHeader = firstRes.headers.get("Payment-Required");
  if (!prHeader) {
    throw new Error("402 response is missing the Payment-Required header");
  }

  const pr = JSON.parse(prHeader) as PaymentRequiredBody;
  const scheme = pr.accepts?.[0];
  if (!scheme?.payTo) {
    throw new Error("No valid payment scheme in Payment-Required header");
  }

  const payTo = scheme.payTo;
  const amount = BigInt(scheme.amount ?? "0");
  // Prefer domain params from scheme.extra when the server provides them
  const domainName = scheme.extra?.name ?? tokenName;
  const domainVersion = scheme.extra?.version ?? tokenVersion;

  // ── Step 3: sign EIP-3009 TransferWithAuthorization ───────────────────
  const nonce = randomBytes32();
  const validAfter = 0n; // valid immediately
  const validBefore = BigInt(Math.floor(Date.now() / 1000)) + 3600n; // 1 h window

  const signature = await walletClient.signTypedData({
    account: from,
    domain: {
      name: domainName,
      version: domainVersion,
      chainId,
      verifyingContract: tokenAddress,
    },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to: payTo,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    },
  });

  // Encode the authorization as base64-encoded JSON for the header
  const auth = {
    from,
    to: payTo,
    value: amount.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature,
  };
  const paymentSigHeader = btoa(JSON.stringify(auth));

  // ── Step 4: retry with payment ─────────────────────────────────────────
  const secondRes = await fetch(`${apiUrl}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Payment-Signature": paymentSigHeader,
    },
    body,
  });

  if (!secondRes.ok) {
    const err = (await secondRes.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(err.message ?? err.error ?? `Payment rejected (${secondRes.status})`);
  }

  const data = (await secondRes.json()) as {
    receiptId: Hex;
    receiptUri: string;
  };
  return { receiptId: data.receiptId, receiptUri: data.receiptUri };
}

// ------------------------------------------------------------------ receipt details

export interface X402ReceiptDetails {
  receiptId: Hex;
  receiptUri: string;
  createdAt: string;
  payer: Address;
  taskPayload: unknown;
}

/**
 * Fetches receipt details from the API server.
 * Returns null if the receipt is not found or the API is unreachable.
 */
export async function fetchReceiptDetails(
  apiUrl: string,
  receiptId: string
): Promise<X402ReceiptDetails | null> {
  try {
    const res = await fetch(`${apiUrl}/receipts/${receiptId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok: boolean;
      receipt?: X402ReceiptDetails;
    };
    return data.receipt ?? null;
  } catch {
    return null;
  }
}

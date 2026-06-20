import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for browser → KMS calls.
//
// Why a route handler instead of a next.config rewrite:
//  - Injects the KMS api key from a SERVER env var (KMS_API_KEY) so the key never
//    ships in the browser bundle (NEXT_PUBLIC_*).
//  - Forwards the browser Origin header — the KMS uses it to pick rp.id and to run
//    its allowed-origin check, so it must reach the KMS unchanged.
//
// Hardening (PR #322 review):
//  #1 fail-closed: in production the server KMS_API_KEY is required; the
//     client-supplied x-api-key fallback is only honored outside production (dev).
//  #2 same-origin: reject cross-origin callers so the privileged server key can't
//     be borrowed to hit arbitrary KMS endpoints with a forged Origin.
//  #3 body cap: bound the request body size before reading it.
export const runtime = "nodejs";

const KMS_BASE = process.env.KMS_PROXY_URL || "https://kms.aastar.io";
const MAX_BODY_BYTES = 64 * 1024; // KMS/WebAuthn payloads are small; 64KB is generous

// Same-origin browser requests carry an Origin whose host matches the app host.
// An absent Origin (e.g. a same-origin GET) is allowed; a mismatching one is not.
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

async function proxy(req: NextRequest, pathParts: string[]) {
  // #2 — block cross-origin callers
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  }

  // #3 — reject oversized bodies up front (content-length can be absent/spoofed;
  // the post-read length check below is the authoritative one)
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // #1 — fail closed: prefer the server key; only fall back to the caller's
  // x-api-key outside production. No key at all → refuse (never proxy unauthed).
  const isProd = process.env.NODE_ENV === "production";
  const apiKey = process.env.KMS_API_KEY || (!isProd ? req.headers.get("x-api-key") : null);
  if (!apiKey) {
    console.error("[kms-proxy] refusing request: KMS_API_KEY is not set (fail-closed)");
    return NextResponse.json({ error: "KMS proxy is not configured" }, { status: 500 });
  }

  const method = req.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await req.text();
  if (body && body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const headers: Record<string, string> = { "x-api-key": apiKey };
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const origin = req.headers.get("origin");
  if (origin) headers["origin"] = origin;

  const url = KMS_BASE + "/" + pathParts.join("/") + req.nextUrl.search;
  const kmsRes = await fetch(url, { method, headers, body });
  const text = await kmsRes.text();

  // Status-only logging — never log the request body (it can carry WebAuthn
  // credentials). On error, surface the KMS error message (no secrets in it).
  if (kmsRes.status >= 400) {
    console.warn(
      `[kms-proxy] ${method} /${pathParts.join("/")} -> ${kmsRes.status}: ${text.slice(0, 500)}`
    );
  }

  return new NextResponse(text, {
    status: kmsRes.status,
    headers: { "content-type": kmsRes.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

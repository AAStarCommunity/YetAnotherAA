import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for browser → KMS calls.
//
// Why a route handler instead of a next.config rewrite:
//  - Injects the KMS api key from a SERVER env var (KMS_API_KEY) so the key
//    never has to be shipped in the browser bundle (NEXT_PUBLIC_*). Falls back
//    to forwarding the caller's x-api-key for local/dev where that's acceptable.
//  - Forwards the browser Origin header — the KMS uses it to pick rp.id and to
//    run its allowed-origin check, so it must reach the KMS unchanged.
export const runtime = "nodejs";

const KMS_BASE = process.env.KMS_PROXY_URL || "https://kms.aastar.io";

async function proxy(req: NextRequest, pathParts: string[]) {
  const targetPath = "/" + pathParts.join("/");
  const url = KMS_BASE + targetPath + req.nextUrl.search;
  const method = req.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await req.text();

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const origin = req.headers.get("origin");
  if (origin) headers["origin"] = origin;
  const apiKey = process.env.KMS_API_KEY || req.headers.get("x-api-key") || "";
  if (apiKey) headers["x-api-key"] = apiKey;

  const kmsRes = await fetch(url, { method, headers, body });
  const text = await kmsRes.text();

  // Status-only logging — never log the request body (it can carry WebAuthn
  // credentials). On error, surface the KMS error message (no secrets in it).
  if (kmsRes.status >= 400) {
    console.warn(`[kms-proxy] ${method} ${targetPath} -> ${kmsRes.status}: ${text.slice(0, 500)}`);
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

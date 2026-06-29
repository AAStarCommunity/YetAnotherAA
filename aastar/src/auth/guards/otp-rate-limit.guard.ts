import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Type,
  mixin,
} from "@nestjs/common";

// In-memory sliding-window rate limit, keyed per (bucket, email). An OTP is email-bound,
// so limiting per normalized email throttles BOTH code-spam (otp/request) and code-guessing
// (otp/verify) without needing the client IP. The store is module-level so it is shared
// across the singleton guards; a periodic sweep, a hard key cap, and per-key pruning bound
// its memory.
//
// NOTE: this is per-process memory — correct for YAA's single-instance backend. A multi-
// replica deployment must move the store to a shared backend (e.g. Redis), or each replica
// would enforce the limit independently.
//
// SCOPE: the key is the exact normalized email, so it bounds spam/guessing against ONE
// address. It does NOT stop an attacker enumerating sub-addresses (victim+1@, victim+2@) to
// spam one inbox — that needs a per-IP limit or captcha, which belongs at the edge/proxy
// (the backend sits behind the Next.js rewrite, so req.ip is the proxy here). Tracked as a
// follow-up; this guard is the per-email layer.
const store = new Map<string, number[]>();

const MAX_WINDOW_MS = 60 * 60_000;
const SWEEP_MS = 10 * 60_000;
// Hard cap on tracked keys. This guard runs BEFORE the DTO ValidationPipe, so a flood of
// distinct emails (even well-formed) could otherwise grow `store` unbounded within a sweep
// period (memory DoS, #388). The cap bounds memory; eviction drops oldest-inserted keys —
// acceptable worst case under a flood (a few limit resets, never OOM).
const MAX_KEYS = 50_000;

const sweep = setInterval(() => {
  const cutoff = Date.now() - MAX_WINDOW_MS;
  for (const [key, hits] of store) {
    if (hits.length === 0 || hits[hits.length - 1] <= cutoff) store.delete(key);
  }
}, SWEEP_MS);
// Don't keep the event loop (or test runner / graceful shutdown) alive for the sweep.
sweep.unref?.();

function evictIfOverCap(): void {
  if (store.size <= MAX_KEYS) return;
  let toDrop = store.size - MAX_KEYS;
  for (const key of store.keys()) {
    store.delete(key);
    if (--toDrop <= 0) break;
  }
}

// Cheap pre-validation: only track plausibly-valid emails so a malformed/garbage body can't
// seed a key. The strict `@IsEmail` still runs later in the pipe (this just bounds garbage).
function looksLikeEmail(s: string): boolean {
  return s.length > 0 && s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

/**
 * Per-email OTP rate-limit guard factory. `bucket` separates the request vs verify counters
 * (so a verify attempt doesn't consume a request's budget). Exceeding `max` hits within
 * `windowMs` yields a 429 with a `Retry-After` header. Bodies without a plausible email fall
 * through so the DTO's `@IsEmail` produces the usual 400 instead of a confusing 429.
 */
export function OtpRateLimit(bucket: string, max: number, windowMs: number): Type<CanActivate> {
  @Injectable()
  class OtpRateLimitGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const http = context.switchToHttp();
      const email = String(http.getRequest()?.body?.email ?? "")
        .trim()
        .toLowerCase();
      if (!looksLikeEmail(email)) return true; // let @IsEmail 400 it; don't seed a key

      const key = `${bucket}:${email}`;
      const now = Date.now();
      const hits = (store.get(key) ?? []).filter(t => t > now - windowMs);

      if (hits.length >= max) {
        store.set(key, hits); // persist the pruned window even when blocking
        const retrySec = Math.ceil((windowMs - (now - hits[0])) / 1000);
        http.getResponse()?.header?.("Retry-After", String(retrySec));
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: "Too Many Requests",
            message: `Too many OTP ${bucket} attempts. Try again in ${retrySec}s.`,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      hits.push(now);
      store.set(key, hits);
      evictIfOverCap();
      return true;
    }
  }
  return mixin(OtpRateLimitGuard);
}

// Test-only: reset the shared store between unit tests. No-ops in production so a stray
// import/call can't clear live rate-limit state.
export function __resetOtpRateLimit(): void {
  if (process.env.NODE_ENV === "production") return;
  store.clear();
}

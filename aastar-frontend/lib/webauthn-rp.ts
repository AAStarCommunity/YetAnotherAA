/**
 * WebAuthn rpId resolver.
 *
 * The TA (dev-rpid build) anchors its rpId hash at the registrable parent domain
 * `aastar.io`, and passkeys/keys are registered under that anchor. So every
 * client-initiated ceremony must pass rpId = the registrable domain, NOT the full
 * host — otherwise on a subdomain like cos72.aastar.io the browser would send
 * `rpId: "cos72.aastar.io"` and the TA-side rpId hash check fails.
 *
 * WebAuthn permits rpId to be a registrable suffix of the current origin's domain,
 * so `cos72.aastar.io` (and `yaa.aastar.io`) may legally use `aastar.io`.
 *
 * We resolve against an explicit deployment-domain list rather than a naive
 * last-two-labels split (which is wrong for multi-level public suffixes like
 * `co.uk`). Deployments elsewhere set NEXT_PUBLIC_RP_DOMAINS (comma-separated) or a
 * hard NEXT_PUBLIC_RP_ID override. localhost / IP literals are returned unchanged
 * (rpId must equal the host there).
 */
const RP_DOMAINS = (process.env.NEXT_PUBLIC_RP_DOMAINS || "aastar.io")
  .split(",")
  .map(s => s.trim().toLowerCase().replace(/\.$/, ""))
  .filter(Boolean);

function canonicalHost(h: string): string {
  return h.toLowerCase().replace(/\.$/, ""); // lowercase + strip FQDN trailing dot
}

export function webauthnRpId(): string {
  const override = process.env.NEXT_PUBLIC_RP_ID;
  if (override) return canonicalHost(override.trim());

  const raw = typeof window !== "undefined" ? window.location.hostname : "";
  if (!raw) return "";
  const h = canonicalHost(raw);

  // localhost, IPv4 literal, or IPv6 literal ([::1]) — rpId must equal the host.
  if (h === "localhost" || h.startsWith("[") || /^[\d.]+$/.test(h)) return h;

  // Map any subdomain to its registrable deployment domain (public-suffix-safe).
  for (const d of RP_DOMAINS) {
    if (h === d || h.endsWith("." + d)) return d;
  }

  // Unconfigured domain: best-effort last-two-labels (set NEXT_PUBLIC_RP_ID to be exact).
  const parts = h.split(".");
  return parts.length <= 2 ? h : parts.slice(-2).join(".");
}

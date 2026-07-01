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
 * localhost / bare-IP dev hosts are returned unchanged (rpId must equal the host there).
 * `NEXT_PUBLIC_RP_ID` overrides everything when set.
 */
export function webauthnRpId(): string {
  const override = process.env.NEXT_PUBLIC_RP_ID;
  if (override) return override;

  const h = typeof window !== "undefined" ? window.location.hostname : "";
  if (!h || h === "localhost" || /^[\d.]+$/.test(h)) return h; // localhost / IPv4 literal
  const parts = h.split(".");
  return parts.length <= 2 ? h : parts.slice(-2).join("."); // *.aastar.io → aastar.io
}

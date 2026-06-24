import type { Page } from "@playwright/test";

/**
 * Install a CDP virtual WebAuthn authenticator on the page so passkey
 * register/get ceremonies complete automatically (no real Face ID / device).
 * Returns the authenticatorId. See docs/TEST_PLAN.md §4.3.
 */
export async function installVirtualAuthenticator(page: Page): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

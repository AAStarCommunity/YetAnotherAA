/**
 * Track C write-flow SDK bootstrap for the operations portal.
 *
 * Operator onboarding / management transactions are signed in the browser by the
 * operator's own EOA. This module turns the WalletContext `WalletClient` into the
 * `@aastar/operator` orchestration clients, and re-exports the bits the flow
 * pages need. Lower-level steps may instead call `@aastar/core` actions
 * (registryActions / stakingActions / xPNTsFactoryActions / superPaymasterActions /
 * sbtActions) directly with the same WalletClient.
 *
 * NOTE: `@aastar/community@0.18.0` is intentionally NOT used — its npm publish is
 * missing `dist/` (tracked in aastar-sdk#52). Community/registry writes go through
 * `@aastar/core` actions instead.
 *
 * @module lib/sdk/operator
 */
import type { WalletClient } from "viem";
import { OperatorLifecycle, PaymasterOperatorClient } from "@aastar/operator";
import { SUPER_PAYMASTER_ADDRESS, GTOKEN_ADDRESS } from "@aastar/core";
import { ensureSdkConfig, getPublicClient } from "./client";

// @aastar/* bundles its own viem copy, so its WalletClient/PublicClient type
// identities differ from the frontend's. The clients are structurally identical
// at runtime; we cast the config and keep the SDK method signatures type-checked.
type AnyClientConfig = {
  client: unknown;
  publicClient?: unknown;
  superPaymasterAddress: unknown;
  tokenAddress?: unknown;
};

function baseConfig(walletClient: WalletClient): AnyClientConfig {
  ensureSdkConfig();
  return {
    client: walletClient,
    publicClient: getPublicClient(),
    superPaymasterAddress: SUPER_PAYMASTER_ADDRESS,
    tokenAddress: GTOKEN_ADDRESS,
  };
}

/** High-level paymaster-operator client (register / deploy V4 / deposit / configure). */
export function buildPaymasterOperatorClient(walletClient: WalletClient): PaymasterOperatorClient {
  return new PaymasterOperatorClient(baseConfig(walletClient) as never);
}

/** Lifecycle orchestrator (setupNode / withdrawAllFunds). */
export function buildOperatorLifecycle(walletClient: WalletClient): OperatorLifecycle {
  return new OperatorLifecycle(baseConfig(walletClient) as never);
}

export { ensureSdkConfig, getPublicClient } from "./client";

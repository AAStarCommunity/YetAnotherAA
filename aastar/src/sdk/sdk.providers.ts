import { Provider, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AirAccountServerClient as YAAAServerClient,
  ServerConfig,
  sepoliaV07Config,
} from "@aastar/sdk/kms";
import { AAStarAirAccountV7ABI } from "@aastar/sdk/core";
import { BackendStorageAdapter } from "./backend-storage.adapter";
import { KmsService } from "../kms/kms.service";
import { AuthService } from "../auth/auth.service";

export const YAAA_SERVER_CLIENT = "YAAA_SERVER_CLIENT";

export const yaaaServerClientProvider: Provider = {
  provide: YAAA_SERVER_CLIENT,
  useFactory: (
    configService: ConfigService,
    storageAdapter: BackendStorageAdapter,
    kmsService: KmsService,
    authService: AuthService
  ): YAAAServerClient => {
    // Contract addresses come straight from the SDK's canonical table
    // (sepoliaV07Config) — NEVER hardcoded/maintained in YAA. v0.7 is the only
    // supported version. This is the single source of truth; updating the SDK
    // picks up new deployments automatically.
    const entryPoints: ServerConfig["entryPoints"] = { v07: sepoliaV07Config() };

    // BLS seed nodes
    const blsSeedNodesStr =
      configService.get<string>("blsSeedNodes") || configService.get<string>("BLS_SEED_NODES");
    const blsSeedNodes = blsSeedNodesStr ? blsSeedNodesStr.split(",").map(s => s.trim()) : [];

    // Default version mapping
    // Only v0.7 is wired (addresses from the SDK canonical table).
    const defaultVersion = "0.7" as "0.6" | "0.7" | "0.8";

    const serverConfig: ServerConfig = {
      rpcUrl: configService.get<string>("ethRpcUrl"),
      bundlerRpcUrl: configService.get<string>("bundlerRpcUrl"),
      chainId: configService.get<number>("chainId") || 10,
      entryPoints,
      defaultVersion,
      blsSeedNodes,
      blsDiscoveryTimeout: 10000,
      kmsEndpoint: configService.get<string>("kmsEndpoint"),
      kmsEnabled: configService.get<boolean>("kmsEnabled") || false,
      storage: storageAdapter,
      // KMS-backed signer using the SDK's KmsSignerAdapter. It carries the
      // per-call, challenge-bound WebAuthn ceremony assertion (from the transfer
      // flow's `webAuthnAssertion`) through to KMS `/SignHash`. Replaces the
      // legacy raw-passkey BackendSignerAdapter, which KMS now rejects (400).
      signer: kmsService.createSignerAdapter(userId => authService.resolveKmsKey(userId)),
    };

    const client = new YAAAServerClient(serverConfig);

    // ── Workaround: @aastar/sdk@0.29.7 GuardChecker ABI gap ─────────────────────────────
    // The tiered path (`useAirAccountTiering: true`, which every YAA transfer uses) routes
    // through TransferManager.resolveSignStrategy → GuardChecker.preCheck → fetchTierConfig,
    // which reads the standalone `tier1Limit()` / `tier2Limit()` getters. But the SDK's
    // internal server-side account ABI (EthereumProvider.getAccountContract) omits those two
    // fragments, so fetchTierConfig throws `AbiFunctionNotFoundError: Function "tier1Limit"
    // not found on ABI` before any tier can be resolved — blocking ALL tiered transfers
    // (Tier-1 self-calls included), not just the new WebAuthn path.
    //
    // Fix it at the seam the SDK leaves public: replace the GuardChecker's fetchTierConfig
    // with one that reads the SAME getters via the SDK's EXPORTED `AAStarAirAccountV7ABI`
    // (which does include them — this is exactly what the frontend tier-setup + fund helper
    // read) through the client's own EthereumProvider. No raw ABIs, no extra RPC client. The
    // `.catch(() => 0n)` mirrors a not-yet-deployed account (tiers read as 0 → an amount-0
    // self-call resolves to Tier-1). Remove once the SDK ships the missing getters.
    const ethereum = (client as unknown as { ethereum?: { getProvider(): any } }).ethereum;
    const guardChecker = (
      client.transfers as unknown as {
        guardChecker?: { fetchTierConfig: (a: string) => Promise<unknown> };
      }
    ).guardChecker;
    if (ethereum && guardChecker) {
      const provider = ethereum.getProvider();
      guardChecker.fetchTierConfig = async (accountAddress: string) => {
        const read = (functionName: "tier1Limit" | "tier2Limit") =>
          provider
            .readContract({ address: accountAddress, abi: AAStarAirAccountV7ABI, functionName })
            .catch(() => 0n);
        const [tier1Limit, tier2Limit] = await Promise.all([
          read("tier1Limit"),
          read("tier2Limit"),
        ]);
        return { tier1Limit: BigInt(tier1Limit), tier2Limit: BigInt(tier2Limit) };
      };
    } else {
      // Fail fast at startup. Without this shim EVERY tiered transfer (Tier-1 self-calls
      // included) throws AbiFunctionNotFoundError at runtime, so a silent `warn` would let
      // a single @aastar/sdk bump that renames `transfers.guardChecker` / `client.ethereum`
      // break all transfers in production undetected. Surface it here and force a conscious
      // re-check of the shim on the next SDK bump.
      const message =
        "GuardChecker.fetchTierConfig shim could not be installed: @aastar/sdk internals " +
        "(transfers.guardChecker / client.ethereum) changed. Update the shim in " +
        "sdk.providers.ts (or drop it if the SDK now ships tier1Limit/tier2Limit) before deploying.";
      new Logger("SdkProvider").error(message);
      throw new Error(message);
    }

    return client;
  },
  inject: [ConfigService, BackendStorageAdapter, KmsService, AuthService],
};

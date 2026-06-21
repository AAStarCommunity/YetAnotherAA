import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AirAccountServerClient as YAAAServerClient,
  ServerConfig,
  sepoliaV07Config,
} from "@aastar/sdk/kms";
import { BackendStorageAdapter } from "./backend-storage.adapter";
import { BackendSignerAdapter } from "./backend-signer.adapter";

export const YAAA_SERVER_CLIENT = "YAAA_SERVER_CLIENT";

export const yaaaServerClientProvider: Provider = {
  provide: YAAA_SERVER_CLIENT,
  useFactory: (
    configService: ConfigService,
    storageAdapter: BackendStorageAdapter,
    signerAdapter: BackendSignerAdapter
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
      signer: signerAdapter,
    };

    return new YAAAServerClient(serverConfig);
  },
  inject: [ConfigService, BackendStorageAdapter, BackendSignerAdapter],
};

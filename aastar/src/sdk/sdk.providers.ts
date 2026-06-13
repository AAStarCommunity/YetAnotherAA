import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { YAAAServerClient, ServerConfig } from "@aastar/airaccount/server";
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
    const entryPoints: ServerConfig["entryPoints"] = {};

    // V0.6
    const epV6 = configService.get<string>("entryPointAddress");
    const factoryV6 = configService.get<string>("aastarAccountFactoryAddress");
    const validatorV6 = configService.get<string>("validatorContractAddress");
    if (epV6 && factoryV6 && validatorV6) {
      entryPoints.v06 = {
        entryPointAddress: epV6,
        factoryAddress: factoryV6,
        validatorAddress: validatorV6,
      };
    }

    // V0.7
    const epV7 = configService.get<string>("entryPointV7Address");
    const factoryV7 = configService.get<string>("aastarAccountFactoryV7Address");
    const validatorV7 = configService.get<string>("validatorContractV7Address");
    if (epV7 && factoryV7 && validatorV7) {
      entryPoints.v07 = {
        entryPointAddress: epV7,
        factoryAddress: factoryV7,
        validatorAddress: validatorV7,
      };
    }

    // V0.8
    const epV8 = configService.get<string>("entryPointV8Address");
    const factoryV8 = configService.get<string>("aastarAccountFactoryV8Address");
    const validatorV8 = configService.get<string>("validatorContractV8Address");
    if (epV8 && factoryV8 && validatorV8) {
      entryPoints.v08 = {
        entryPointAddress: epV8,
        factoryAddress: factoryV8,
        validatorAddress: validatorV8,
      };
    }

    // BLS seed nodes
    const blsSeedNodesStr =
      configService.get<string>("blsSeedNodes") || configService.get<string>("BLS_SEED_NODES");
    const blsSeedNodes = blsSeedNodesStr ? blsSeedNodesStr.split(",").map(s => s.trim()) : [];

    // Default version mapping
    const defaultVersionRaw = configService.get<string>("defaultEntryPointVersion") || "0.6";
    const defaultVersion = defaultVersionRaw as "0.6" | "0.7" | "0.8";

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

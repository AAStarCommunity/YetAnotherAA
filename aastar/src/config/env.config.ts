import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface EnvironmentConfig {
  // Server
  port: number;
  nodeEnv: string;
  apiPrefix: string;

  // Database
  dbType: "json" | "postgres";
  databaseUrl?: string;

  // JWT & Authentication
  jwtSecret: string;
  jwtExpiresIn: string;
  userEncryptionKey: string;

  // WebAuthn (Optional)
  webauthnRpName: string;
  webauthnRpId: string;
  webauthnOrigin: string;

  // Ethereum (contract addresses come from @aastar/sdk canonical table, not env)
  ethRpcUrl: string;
  bundlerRpcUrl: string;
  ethPrivateKey?: string;

  // BLS Network (Optional)
  blsSeedNodes?: string;
  blsFallbackEndpoints?: string;
}

@Injectable()
export class EnvConfigService {
  private static instance: EnvironmentConfig;

  constructor(private configService: ConfigService) {
    if (!EnvConfigService.instance) {
      EnvConfigService.instance = this.loadConfig();
      this.validateConfig();
    }
  }

  private loadConfig(): EnvironmentConfig {
    return {
      // Server
      port: this.configService.get<number>("PORT", 3000),
      nodeEnv: this.configService.get<string>("NODE_ENV", "development"),
      apiPrefix: this.configService.get<string>("API_PREFIX", "api/v1"),

      // Database
      dbType: this.configService.get<string>("DB_TYPE", "json") as "json" | "postgres",
      databaseUrl: this.configService.get<string>("DATABASE_URL"),

      // JWT & Authentication
      jwtSecret: this.configService.get<string>("JWT_SECRET"),
      jwtExpiresIn: this.configService.get<string>("JWT_EXPIRES_IN", "7d"),
      userEncryptionKey: this.configService.get<string>("USER_ENCRYPTION_KEY"),

      // WebAuthn (Optional with defaults)
      webauthnRpName: this.configService.get<string>("WEBAUTHN_RP_NAME", "AAstar"),
      webauthnRpId: this.configService.get<string>("WEBAUTHN_RP_ID", "localhost"),
      webauthnOrigin: this.configService.get<string>("WEBAUTHN_ORIGIN", "http://localhost:8080"),

      // Ethereum & Contracts
      ethRpcUrl: this.configService.get<string>("ETH_RPC_URL"),
      bundlerRpcUrl: this.configService.get<string>("BUNDLER_RPC_URL"),
      ethPrivateKey: this.configService.get<string>("ETH_PRIVATE_KEY"),

      // BLS Network (Optional)
      blsSeedNodes: this.configService.get<string>("BLS_SEED_NODES"),
      blsFallbackEndpoints: this.configService.get<string>("BLS_FALLBACK_ENDPOINTS"),
    };
  }

  private validateConfig(): void {
    const config = EnvConfigService.instance;
    const errors: string[] = [];

    // Validate required fields
    if (!config.jwtSecret) {
      errors.push("JWT_SECRET is required");
    }

    if (!config.userEncryptionKey) {
      errors.push("USER_ENCRYPTION_KEY is required");
    }

    if (!config.ethRpcUrl) {
      errors.push("ETH_RPC_URL is required");
    }

    if (!config.bundlerRpcUrl) {
      errors.push("BUNDLER_RPC_URL is required");
    }

    // Validate database configuration
    if (config.dbType === "postgres" && !config.databaseUrl) {
      errors.push('DATABASE_URL is required when DB_TYPE is "postgres"');
    }

    // If there are errors, throw them all at once
    if (errors.length > 0) {
      throw new Error(
        `Environment configuration validation failed:\n${errors.map(e => `  - ${e}`).join("\n")}`
      );
    }

    console.log("✅ Environment configuration validated successfully");
  }

  static get(): EnvironmentConfig {
    if (!EnvConfigService.instance) {
      throw new Error(
        "EnvConfigService not initialized. Please ensure it is imported in AppModule"
      );
    }
    return EnvConfigService.instance;
  }

  get config(): EnvironmentConfig {
    return EnvConfigService.instance;
  }
}

// Export a function for direct access
export function getEnvConfig(): EnvironmentConfig {
  return EnvConfigService.get();
}

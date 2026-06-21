export default () => {
  // Validate required environment variables
  const requiredVars = ["JWT_SECRET", "USER_ENCRYPTION_KEY", "ETH_RPC_URL", "BUNDLER_RPC_URL"];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Environment configuration validation failed:\n${missingVars.map(v => `  - ${v} is required`).join("\n")}`
    );
  }

  // Validate database configuration
  if (process.env.DB_TYPE === "postgres" && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DB_TYPE is "postgres"');
  }

  // Check if at least one EntryPoint version is configured
  const hasV6Config =
    process.env.ENTRY_POINT_ADDRESS &&
    process.env.AASTAR_ACCOUNT_FACTORY_ADDRESS &&
    process.env.VALIDATOR_CONTRACT_ADDRESS;

  const hasV7Config =
    process.env.ENTRY_POINT_V7_ADDRESS &&
    process.env.AASTAR_ACCOUNT_FACTORY_V7_ADDRESS &&
    process.env.VALIDATOR_CONTRACT_V7_ADDRESS;

  const hasV8Config =
    process.env.ENTRY_POINT_V8_ADDRESS &&
    process.env.AASTAR_ACCOUNT_FACTORY_V8_ADDRESS &&
    process.env.VALIDATOR_CONTRACT_V8_ADDRESS;

  if (!hasV6Config && !hasV7Config && !hasV8Config) {
    throw new Error("At least one EntryPoint version must be configured");
  }

  console.log("✅ Environment configuration validated successfully");

  return {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
    apiPrefix: process.env.API_PREFIX || "api/v1",
    dbType: process.env.DB_TYPE || "json",
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    userEncryptionKey: process.env.USER_ENCRYPTION_KEY,
    webauthnRpName: process.env.WEBAUTHN_RP_NAME || "AAstar",
    webauthnRpId: process.env.WEBAUTHN_RP_ID || "localhost",
    webauthnOrigin: process.env.WEBAUTHN_ORIGIN || "http://localhost:8080",
    ethRpcUrl: process.env.ETH_RPC_URL,
    bundlerRpcUrl: process.env.BUNDLER_RPC_URL,
    ethPrivateKey: process.env.ETH_PRIVATE_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || "hi@aastar.io",
    // v0.6 configuration (backward compatibility)
    entryPointAddress: process.env.ENTRY_POINT_ADDRESS,
    aastarAccountFactoryAddress: process.env.AASTAR_ACCOUNT_FACTORY_ADDRESS,
    validatorContractAddress: process.env.VALIDATOR_CONTRACT_ADDRESS,
    // v0.7 configuration
    entryPointV7Address: process.env.ENTRY_POINT_V7_ADDRESS,
    aastarAccountFactoryV7Address: process.env.AASTAR_ACCOUNT_FACTORY_V7_ADDRESS,
    validatorContractV7Address: process.env.VALIDATOR_CONTRACT_V7_ADDRESS,
    // v0.8 configuration
    entryPointV8Address: process.env.ENTRY_POINT_V8_ADDRESS,
    aastarAccountFactoryV8Address: process.env.AASTAR_ACCOUNT_FACTORY_V8_ADDRESS,
    validatorContractV8Address: process.env.VALIDATOR_CONTRACT_V8_ADDRESS,
    // Default version (can be overridden per account)
    defaultEntryPointVersion: process.env.DEFAULT_ENTRYPOINT_VERSION || "0.6",
    blsSeedNodes: process.env.BLS_SEED_NODES,
    chainId: parseInt(process.env.CHAIN_ID, 10) || 10,
    // Single source for the operations-portal chain (registry/admin/operator/community).
    // Override via REGISTRY_CHAIN_ID; services fall back to CHAIN_SEPOLIA from @aastar/core.
    registryChainId: process.env.REGISTRY_CHAIN_ID
      ? parseInt(process.env.REGISTRY_CHAIN_ID, 10)
      : undefined,
    blsFallbackEndpoints: process.env.BLS_FALLBACK_ENDPOINTS,
    // KMS configuration
    kmsEnabled: process.env.KMS_ENABLED === "true",
    kmsEndpoint: process.env.KMS_ENDPOINT || "https://kms1.aastar.io",
    kmsApiKey: process.env.KMS_API_KEY,
    // AAStar contract addresses (fallback to @aastar/core canonical after applyConfig)
    registryAddress: process.env.REGISTRY_ADDRESS,
    stakingAddress: process.env.STAKING_ADDRESS,
    superPaymasterAddress: process.env.SUPER_PAYMASTER_ADDRESS,
    gtokenAddress: process.env.GTOKEN_ADDRESS,
    xpntsFactoryAddress: process.env.XPNTS_FACTORY_ADDRESS,
    paymasterFactoryAddress: process.env.PAYMASTER_FACTORY_ADDRESS,
    mysbtAddress: process.env.MYSBT_ADDRESS,
    apntsAddress: process.env.APNTS_ADDRESS,
    priceFeedAddress: process.env.PRICE_FEED_ADDRESS,
    // Sale contract addresses
    gTokenSaleAddress: process.env.GTOKEN_SALE_ADDRESS,
    aPNTsSaleAddress: process.env.APNTS_SALE_ADDRESS,
  };
};

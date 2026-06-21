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

  // EntryPoint / factory / validator addresses are sourced from the @aastar/sdk
  // canonical table (sepoliaV07Config) in sdk.providers.ts — NOT from .env — so
  // there is nothing to validate here.

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
    // EntryPoint / factory / validator addresses are NOT configured here — they come
    // from the @aastar/sdk canonical table (sepoliaV07Config) in sdk.providers.ts.
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
    // HTTP Origin the backend forwards to the KMS so its resolve_rp_id() picks the
    // SAME rpId the browser used during BeginAuthentication (which the frontend
    // /kms-api proxy forwards as the browser origin). Without this, server-to-server
    // SignHash calls send no Origin and the KMS falls back to its first KMS_RP_ID
    // (aastar.io), causing an rpIdHash mismatch against localhost-origin assertions.
    kmsWebauthnOrigin: process.env.KMS_WEBAUTHN_ORIGIN || "http://localhost:5173",
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

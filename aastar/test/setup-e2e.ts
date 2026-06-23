// Runs before the e2e test module is imported, so AppConfigModule's startup
// validation sees a complete config. Real services are NOT hit: KMS is disabled,
// the DB is the file-based JSON adapter, and the RPC/bundler URLs are dummies
// (the routes under test — auth guards + SDK-canonical paymaster presets — make
// no network calls). Any value already in the environment wins, so a developer
// can point these at real services locally.
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e-test-jwt-secret-not-for-prod";
// USER_ENCRYPTION_KEY must be exactly 32 chars (AES-256).
process.env.USER_ENCRYPTION_KEY =
  process.env.USER_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef";
process.env.ETH_RPC_URL = process.env.ETH_RPC_URL || "http://127.0.0.1:8545";
process.env.BUNDLER_RPC_URL = process.env.BUNDLER_RPC_URL || "http://127.0.0.1:8545";
process.env.KMS_ENABLED = "false";
process.env.DB_TYPE = process.env.DB_TYPE || "json";
process.env.CHAIN_ID = process.env.CHAIN_ID || "11155111";

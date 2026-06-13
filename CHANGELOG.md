# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-03-15

### Fixed

- **Backend**: Guard undefined `walletAddress` in community, operator, sale, and
  registry controllers — JWT payload lacks `walletAddress`, so endpoints now
  return safe defaults instead of 500 errors
- **Frontend**: All portal pages (role, community, operator, admin, sale) now
  use `<Layout requireAuth>` — fixes redirect-to-dashboard bug caused by
  Layout's `!requireAuth && token` guard
- **Frontend**: Unified accent colors from indigo/blue/purple to slate/emerald
  theme across all portal pages to match main dashboard
- **Frontend**: IPFS `ipfs://` URLs now proxied through Pinata gateway to fix
  `ERR_UNKNOWN_URL_SCHEME` in community logos
- **Frontend**: Updated `simplewebauthn/browser` v13+ API — `optionsJSON`
  wrapper format (`startRegistration` in register page; `startAuthentication` in
  login and transfer pages)
- **Frontend**: Added mushroom emoji icons (icon-192.png, icon-512.png,
  apple-icon.png) to fix 404 errors
- **Backend**: Updated `.env.example` to use M4 AirAccount factory address
  (`0x914db0...`) matching `@aastar/core` SDK constants

## [0.7.0] - 2026-03-15

### Management Portal

- **Role-Based Portal System**: Added `/role` page with role selection (Admin,
  Operator, Community, Sale)
- **Admin Portal** (`/admin`): Protocol-level management — registry overview,
  role configurations, GToken stats, system addresses
- **Operator Portal** (`/operator`): SPO/V4 operator status, paymaster
  deployment guides, operator lists
- **Community Portal** (`/community`): Community dashboard, address lookup,
  community admin list with xPNTs token info
- **Sale Portal** (`/sale`): GToken bonding curve sale status, aPNTs fixed-price
  sale, eligibility check, price calculator

### Added

- `@aastar/sdk` and `@aastar/core` integration for on-chain reads
- Registry module with contract state queries via SDK
- Unit tests for all management portal services (34 tests passing)
- Dev/backend/frontend start-stop-restart scripts (`dev.sh`, `backend.sh`,
  `frontend.sh`)
- Deployed sale contract addresses for Sepolia
- `.env.sepolia.example` with full Sepolia configuration reference

### Fixed

- **Critical**: Removed unnecessary SWC builder that caused circular dependency
  errors; fixed `ox` library TS compilation via `tsconfig.build.json` paths
  override redirecting imports to `_types/*.d.ts`
- **High**: Replaced `private publicClient: any` with proper `PublicClient`
  typing across 5 service files; added try/catch error handling around contract
  calls; removed hardcoded `sepolia` chain from `createPublicClient`
- **Medium**: Fixed Tailwind CSS dynamic class names (`bg-${color}-100`) with
  static `ROLE_COLOR_MAP` lookup; fixed entity circular imports using
  `import type` + string-based `@ManyToOne` references
- **Low**: Separated `viewport` export from `metadata` per Next.js 16
  requirements; removed non-existent `icon-192.png` reference
- **Deps**: Pinned `viem` to `2.43.3` across all workspaces to prevent
  `ox@0.14.5`; added root-level `ox: 0.11.1` override
- Fixed Swagger `@ApiQuery` enum serialization (`Object.values()` +
  `type: 'string'`)

### Documentation

- Added development milestones with E2E test requirements
- Updated plan v3.1 with SDK/contract analysis corrections
- Fixed contract addresses to use `@aastar/core` canonical values
- Added management portal section to README

## [0.6.0] - 2025-01-24

### ⚡ Performance Optimization: Lazy KMS EOA Creation

#### Major Changes

- **Deferred Wallet Creation**: User wallet (EOA) creation has been moved from
  registration time to account creation time
  - Registration is now 10-20x faster
  - Only users who create smart accounts will have wallets generated
  - Supports both KMS and local wallet modes

- **New Authentication Flow**:
  - **Registration Phase**: Only creates user record with Passkey (no KMS API
    call)
  - **Account Creation Phase**: Wallet is created on-demand when first account
    is created
  - Automatic detection of existing wallets to avoid duplicate creation

#### Added

- **ensureUserWallet() Method** (`aastar/src/auth/auth.service.ts`):
  - Creates wallet on-demand if not exists
  - Returns wallet directly to avoid database race conditions
  - Supports both KMS mode and local wallet generation
  - Comprehensive logging for debugging

#### Changed

- **User Entity Schema** (`aastar/src/entities/user.entity.ts`):
  - `walletAddress` column is now nullable (`{ nullable: true }`)
  - Wallet-related fields are optional during registration

- **Registration Methods** (`aastar/src/auth/auth.service.ts`):
  - Removed immediate EOA creation from `register()` method
  - Removed immediate EOA creation from `completePasskeyRegistration()` method
  - Registration now only creates user record without wallet initialization

- **Account Creation** (`aastar/src/account/account.service.ts`):
  - `createAccount()` now calls `ensureUserWallet()` before account creation
  - Uses returned wallet directly instead of making additional database queries
  - Eliminates database race conditions

- **Wallet Retrieval** (`aastar/src/auth/auth.service.ts`):
  - `getUserWallet()` now throws clear error if wallet is not initialized
  - Error message guides developers to use `ensureUserWallet()` first

**For developers:**

```typescript
// ❌ Old pattern (may throw error for new users):
const wallet = await authService.getUserWallet(userId);

// ✅ New pattern (safe for all users):
const wallet = await authService.ensureUserWallet(userId);
```

#### Technical Details

**Dependencies Updated:**

- Downgraded `eslint` to v8 in frontend for compatibility

---

## [0.5.0] - 2025-10-16

### 🏗️ Architecture Evolution: Remote BLS Service

#### Major Changes

- **Removed Validator Submodule**: The validator submodule has been removed from
  the monorepo
  - BLS signing service now operates as an independent remote service
  - Default endpoint: https://yetanotheraa-validator.onrender.com
  - Configured via `BLS_SEED_NODES` environment variable

- **Simplified Deployment**:
  - Docker deployment now only includes backend and frontend services
  - Validator/signer infrastructure maintained separately
  - Reduced complexity for application deployment

#### Benefits

- **Microservices Architecture**: Clear separation between application layer and
  signing infrastructure
- **Easier Deployment**: Application can be deployed without managing BLS nodes
- **Scalability**: BLS signing service can scale independently
- **Flexibility**: Easy to switch between different BLS service providers

#### Configuration Changes

- **Removed from Dockerfile**:
  - Validator package installation
  - Validator build steps

- **Removed from ecosystem.config.js**:
  - `validator-node1` PM2 application

- **Updated .vscode/launch.json**:
  - Removed all `Validator:Node1/2/3` configurations
  - Simplified compound launch configurations
  - Backend now points to remote BLS service by default

#### Migration Notes

- Update `BLS_SEED_NODES` to point to your BLS service endpoint
- No local BLS node setup required for development
- For custom BLS infrastructure, see
  [YetAnotherAA-Validator](https://github.com/fanhousanbu/YetAnotherAA-Validator)

### 📚 Documentation Updates

- Updated README.md to reflect remote BLS service architecture
- Updated CONTRIBUTING.md with new project structure
- Clarified smart contract deployment is separate from application deployment
- Updated GitHub Actions CI workflow to remove validator jobs

### 🐛 Bug Fixes

- **JWT Module**: Fixed TypeScript compilation error in auth module after
  `@nestjs/jwt` package upgrade
  - Added explicit `JwtModuleOptions` return type to useFactory
  - Added type assertion for `expiresIn` to handle stricter type requirements

## [0.4.0] - 2025-10-08

### 🏗️ Architecture Restructuring

#### Major Changes

- **Signer Service Extraction**: The BLS signature service (formerly `@signer`
  workspace) has been extracted from the monorepo into an independent project
  - New repository:
    [YetAnotherAA-Validator](https://github.com/fanhousanbu/YetAnotherAA-Validator)
  - Renamed from `signer` to `validator` to better reflect its dual role (signer
    service + validator contracts)
  - Integrated as a git submodule at `validator/` directory

- **Workspace Simplification**: Monorepo now contains only two workspaces
  - `aastar` - Backend API service
  - `aastar-frontend` - Next.js frontend application
  - `validator` - Git submodule referencing YetAnotherAA-Validator

#### Benefits

- **Clearer Separation of Concerns**: Validator/signer logic is now maintained
  independently
- **Reusability**: The validator service can be used by other projects without
  including the full stack
- **Simplified Monorepo**: Main repository focuses on the application layer
  (backend + frontend)
- **Version Control**: Validator updates can be managed through git submodule
  versioning

#### Migration Notes

- All validator-related code now resides in the `validator/` submodule
- VS Code launch configurations updated to reference `validator/` instead of
  `signer/`
- The validator submodule includes both:
  - BLS signature aggregation service (NestJS)
  - Smart contracts for signature verification (Solidity/Foundry)

### 🔧 Technical Changes

- Updated `.vscode/launch.json` configurations:
  - Renamed `Signer:Node1/2/3` to `Validator:Node1/2/3`
  - Updated `cwd` paths from `${workspaceFolder}/signer` to
    `${workspaceFolder}/validator`
  - Updated compound configurations (`Signers Only` → `Validators Only`, etc.)

- Updated `package.json`:
  - Removed `signer` from workspaces array
  - Monorepo now manages only `aastar` and `aastar-frontend`

- Git submodule configuration:
  - Added `validator` submodule pointing to
    `https://github.com/fanhousanbu/YetAnotherAA-Validator.git`
  - Submodule currently tracks commit `a6ef99f` (master branch)

### 📚 Related Projects

This restructuring creates a cleaner ecosystem:

1. **[YetAnotherAA](https://github.com/fanhousanbu/YetAnotherAA)** (this repo) -
   Application layer with backend API and frontend
2. **[YetAnotherAA-Validator](https://github.com/fanhousanbu/YetAnotherAA-Validator)** -
   BLS signature infrastructure and smart contracts

## [0.3.1] - 2025-10-07

### ✨ New Features

- **NFT Support**: Added comprehensive NFT management functionality
  - Support for ERC-721 and ERC-1155 standards
  - NFT collection view with metadata display
  - Automatic NFT metadata fetching from IPFS
  - NFT ownership verification

- **Data Management Tools**: Implemented persistent data export/import
  functionality
  - Export all user data as compressed archive (.tar.gz)
  - Import data with backup and rollback protection
  - Password-protected operations for security
  - Automatic backup before import

### 🎨 UI Improvements

- Enhanced user interface with better visual design
- Improved responsive layout for mobile devices
- Optimized NFT display cards with collection grouping
- Better error handling and user feedback

### 🔧 Technical Improvements

- Unified HTTP client usage (axios) across backend services
- Fixed TypeScript type errors in API calls
- Improved code consistency and maintainability

## [0.3.0] - 2025-10-06

### 📱 Mobile Optimization

- **Mobile Adaptation**: Enhanced frontend with responsive design and
  mobile-first user experience
  - Implemented adaptive UI patterns for different screen sizes
  - Optimized touch interactions and navigation flows for mobile devices
  - Added QR code display for easy address sharing
  - Integrated native mobile features including share API

## [0.2.1] - 2025-10-03

### 🔒 Security

- Fixed code scanning alert no. 9: Use of externally-controlled format string in
  `gossip.service.ts`
- Fixed code scanning alert no. 40: Use of externally-controlled format string
  in error logging

### 🎨 Improvements

- Code formatting cleanup
- Updated README.md with corrected architecture diagram alignment
- Updated transaction proof example to latest successful transfer
  (`0x39f8dbf5...30139f985`)

### 🔧 Technical Changes

- Modified `signer/src/modules/gossip/gossip.service.ts` to use safer string
  formatting patterns
- Replaced template literals in error messages with parameterized format strings
  to prevent potential injection vulnerabilities

## [0.2.0] - 2025-10-03

### 🎉 Initial Release

This is the first release of YetAnotherAA, a production-ready implementation
combining WebAuthn/Passkey biometric authentication, BLS signature aggregation,
ERC-4337 account abstraction, and KMS-based key management.

### ✨ Core Features

#### 🔐 WebAuthn/Passkey Authentication

- **Passwordless Experience**: Complete biometric authentication flow (Face ID,
  Touch ID, Windows Hello)
- **FIDO2 Compliance**: Industry-standard WebAuthn implementation with mandatory
  user verification
- **Multi-Device Support**: Users can register passkeys across multiple devices
- **Transaction Security**: Every transaction requires biometric confirmation

#### ⚡ BLS Signature Aggregation

- **Multi-Node Architecture**: Aggregate signatures from multiple BLS nodes
  efficiently
- **Gossip Network**: Automatic node discovery and selection via P2P WebSocket
  network
- **Dynamic Gas Optimization**: EIP-2537-based calculation that adapts to node
  count
- **Production Ready**: Verified on Sepolia testnet with successful transactions

#### 🏗️ ERC-4337 Account Abstraction

- **Multi-Version Support**: Compatible with EntryPoint v0.6, v0.7, and v0.8
- **Unified Architecture**: User wallet acts as both creator and signer (no
  separate deployer needed)
- **Gasless Deployment**: Account creation sponsored by Paymaster - zero ETH
  required for users
- **Dual Verification**: AA signatures verify userOpHash, BLS signatures verify
  messagePoint

#### 🔑 KMS Integration

- **Secure Key Management**: Production wallets managed by Key Management
  Service
- **Zero Private Key Exposure**: Keys never leave the secure KMS environment
- **Auto-Generated Wallets**: User wallets created automatically (KMS in
  production, local in dev)
- **No Manual Configuration**: Private keys only needed for initial contract
  deployment

#### 💰 Paymaster Sponsorship

- **Gasless Onboarding**: Account deployment fully sponsored - users need zero
  ETH
- **Flexible Sponsorship**: Optional transaction sponsorship for improved UX
- **True Web2 Experience**: Users can interact with blockchain without holding
  gas tokens

### 📦 Components

#### Smart Contracts (validator/)

- `AAStarValidator.sol` - BLS signature validator with dynamic gas calculation
- `AAStarAccountV6.sol` - ERC-4337 account implementation (EntryPoint v0.6)
- `AAStarAccountV7.sol` - Packed account implementation (EntryPoint v0.7)
- `AAStarAccountV8.sol` - Packed account implementation (EntryPoint v0.8)
- `AAStarAccountFactory*.sol` - Account factories for all EntryPoint versions

#### Backend API (aastar/)

- User registration and authentication with WebAuthn
- Account management (create, query, balance)
- Transfer service with BLS signature aggregation
- KMS integration for secure key management
- Support for both JSON file storage and PostgreSQL

#### BLS Signer Service (signer/)

- HTTP API for signature generation
- WebSocket gossip network for node coordination
- Automatic peer discovery and health monitoring
- Node state persistence with BLS key management

#### Frontend (aastar-frontend/)

- Next.js 15 application with biometric authentication UI
- Passkey registration and login flows
- Account creation and management interface
- Transfer functionality with real-time status tracking

#### Paymaster (paymaster/)

- ERC-4337 paymaster implementation
- Admin interface for paymaster management
- Sponsorship configuration and monitoring

### 🔧 Technical Highlights

- **BLS12-381 Cryptography**: Pairing-based signature aggregation
- **Dynamic Gas Calculation**: Adapts to node count with 25% safety margin
- **Gossip Protocol**: Efficient P2P node discovery and coordination
- **Multi-Database Support**: JSON file storage (dev) and PostgreSQL (prod)
- **Comprehensive Type Safety**: Full TypeScript implementation
- **Monorepo Architecture**: Unified workspace with npm workspaces

### 🧪 Verification

- Successfully deployed and tested on Sepolia testnet
- Verified transfer:
  [0x8aa6fdef...714370a55](https://sepolia.etherscan.io/tx/0x8aa6fdef19f66e687a570c4fefeb7524538a32fcb06320251d25c5b714370a55)
- Gas efficiency tested with 1-3 nodes configuration
- WebAuthn flows tested across Chrome, Safari, Firefox, and Edge

### 📚 Documentation

- Comprehensive README with quick start guide
- CLAUDE.md with detailed architecture documentation
- KMS integration guide
- Multi-version EntryPoint support documentation
- API documentation via Swagger/OpenAPI

### 🔒 Security

- Mandatory biometric verification for all sensitive operations
- KMS-based key management for production environments
- Unified creator/signer architecture for simplified trust model
- No private key exposure in runtime configuration
- Encrypted storage for local development keys

### 🚀 Deployment

Reference deployments on Sepolia testnet:

- **AAStarValidator**: `0xD9756c11686B59F7DDf39E6360230316710485af`
- **AAStarAccountFactory (v0.6)**: `0xab18406D34B918A0431116755C45AC7af99DcDa6`
- **AAStarAccountFactory (v0.7)**: `0xAae813Ae38418f38701142cEab08D4F52383bF34`
- **EntryPoint v0.6**: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
- **EntryPoint v0.7**: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

### 📝 Notes

- This is a **production-ready reference implementation**
- For production use, deploy your own contracts
- KMS integration requires external KMS service (e.g., https://kms.aastar.io)
- WebAuthn requires HTTPS in production (localhost works for development)

---

**Full Changelog**: Initial release - v0.1.0

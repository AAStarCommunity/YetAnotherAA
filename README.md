# 🔐 WebAuthn + BLS + ERC-4337 Account Abstraction

[![GitHub Stars](https://img.shields.io/github/stars/fanhousanbu/YetAnotherAA?style=for-the-badge&logo=github)](https://github.com/fanhousanbu/YetAnotherAA/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/fanhousanbu/YetAnotherAA?style=for-the-badge&logo=github)](https://github.com/fanhousanbu/YetAnotherAA/network)
[![CI Status](https://img.shields.io/github/actions/workflow/status/fanhousanbu/YetAnotherAA/ci.yml?branch=master&style=for-the-badge&logo=github-actions)](https://github.com/fanhousanbu/YetAnotherAA/actions)
[![License](https://img.shields.io/github/license/fanhousanbu/YetAnotherAA?style=for-the-badge)](https://github.com/fanhousanbu/YetAnotherAA/blob/master/LICENSE)

<div align="center">

🚀 **Production-Ready** | 🔐 **WebAuthn/Passkey** | ⚡ **BLS Signatures** | 🏗️
**ERC-4337 AA** | 🔑 **KMS Integration**

</div>

---

A **complete, production-ready** implementation combining **biometric
authentication** (Face ID, Touch ID, Windows Hello), **BLS aggregate
signatures**, and **ERC-4337 account abstraction**. Features passwordless login,
mandatory transaction verification, **KMS-based key management**, and **gasless
account deployment** via Paymaster sponsorship.

> **🎯 Perfect for**: Web3 developers building secure wallets, DeFi applications
> requiring enhanced security, and projects needing passwordless blockchain
> authentication with enterprise-grade key management.

## ⚡ Quick Start

### Option 1: Docker Deployment (Recommended)

```bash
# Clone the repository
git clone https://github.com/fanhousanbu/YetAnotherAA.git
cd YetAnotherAA

# Build the image
docker build -t yaaa:latest .

# Run the container
docker run -p 80:80 yaaa:latest

# Visit http://localhost and register with Face ID/Touch ID!
```

### Option 2: Local Development

```bash
# Clone and install dependencies
git clone https://github.com/fanhousanbu/YetAnotherAA.git
cd YetAnotherAA && npm install

# Start all services (VS Code launch configuration recommended)
npm run start:dev -w aastar        # Backend API (port 3000)
npm run dev -w aastar-frontend     # Frontend (port 8080)

# Visit http://localhost:8080 and start using!
# Note: BLS signing service uses remote endpoint (https://yetanotheraa-validator.onrender.com)
```

> **💡 Tip**: Use VS Code's "Run and Debug" panel to launch all services with
> one click (`.vscode/launch.json` configured)

## ✨ Core Innovations

### 🔐 **1. WebAuthn/Passkey Authentication**

- **Passwordless Experience**: Login and transactions using only biometrics
  (Face ID, Touch ID, Windows Hello)
- **FIDO2 Compliant**: Industry-standard WebAuthn implementation with mandatory
  user verification
- **Multi-Device Support**: Register passkeys across multiple devices
- **Transaction Security**: Every transaction requires biometric confirmation

### ⚡ **2. BLS Signature Aggregation**

- **Multi-Node Signatures**: Aggregate signatures from multiple BLS nodes
  efficiently
- **Dynamic Gas Optimization**: EIP-2537-based calculation adapts to node count
- **Gossip Network**: Automatic node discovery and selection via P2P network
- **Quantum-Ready**: BLS12-381 curve provides preparation for post-quantum
  security

### 🏗️ **3. ERC-4337 Account Abstraction**

- **Multi-Version Support**: Compatible with EntryPoint v0.6, v0.7, and v0.8
- **Unified Architecture**: User wallet acts as both creator and signer (no
  separate deployer)
- **Gasless Deployment**: Account creation sponsored by Paymaster - **zero ETH
  required**
- **Dual Verification**: AA signatures verify userOpHash, BLS signatures verify
  messagePoint

### 🔑 **4. KMS Integration (Production Ready)**

- **Secure Key Management**: Production wallets managed by Key Management
  Service
- **Zero Private Key Exposure**: Keys never leave the secure KMS environment
- **Auto-Generated Wallets**: User wallets created automatically (KMS in
  production, local in dev)
- **No Manual Configuration**: Private keys only needed for initial contract
  deployment

### 💰 **5. Paymaster Sponsorship**

- **Gasless Onboarding**: Account deployment fully sponsored - users need zero
  ETH
- **Flexible Sponsorship**: Optional transaction sponsorship for improved UX
- **True Web2 Experience**: Users can interact with blockchain without holding
  gas tokens

## 🛠️ Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│              WebAuthn + Biometric Interface                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Backend API (NestJS)                           │
│   • WebAuthn Authentication  • KMS Integration              │
│   • Account Management       • Transfer Orchestration       │
└────────┬───────────────────────┬──────────────────┬─────────┘
         │                       │                  │
┌────────▼──────────┐  ┌─────────▼─────────┐  ┌───▼──────────┐
│   KMS Service     │  │ Remote BLS Signer │  │   Bundler    │
│ • Key Generation  │  │ • Gossip Network  │  │  (Pimlico)   │
│ • Secure Signing  │  │ • Signature Agg   │  │              │
└───────────────────┘  └─────────┬─────────┘  └───┬──────────┘
                                 │                │
┌────────────────────────────────▼────────────────▼───────────┐
│               Ethereum (ERC-4337)                           │
│  EntryPoint → Factory → AAStarAccount → Validator (BLS)     │
└─────────────────────────────────────────────────────────────┘
```

### Key Technical Features

**Dynamic Gas Calculation**

```solidity
function _calculateRequiredGas(uint256 nodeCount) internal pure returns (uint256) {
  // EIP-2537 pairing: 32600 * k + 37700 (k=2)
  uint256 pairingBaseCost = 102900;
  // G1 additions: (nodeCount - 1) * 500
  uint256 g1AdditionCost = (nodeCount - 1) * 500;
  // Storage reads: nodeCount * 2100
  uint256 storageReadCost = nodeCount * 2100;
  // EVM overhead: 50000 + (nodeCount * 1000)
  uint256 evmExecutionCost = 50000 + (nodeCount * 1000);

  return calculateFinalGas(totalCost); // 25% margin + limits
}
```

**BLS Signature Format** (705 bytes)

```
[nodeIdsLength(32)][nodeIds...][blsSignature(256)][messagePoint(256)][aaSignature(65)]
```

**Dual Verification Process**

```
1. ECDSA: Verify userOpHash.toEthSignedMessageHash() against signer
2. BLS: Aggregate public keys from selected nodes
3. Pairing: Verify e(G, signature) = e(aggPubKey, messagePoint)
```

## 📊 Verification & Results

### Successful Transfer Proof

- **Transaction**:
  [0x39f8dbf5...30139f985](https://sepolia.etherscan.io/tx/0x39f8dbf5e99bc40b5032c0f260aa003901c372873fb989f2dd3c81030139f985)
- **Amount**: 1 PNT

### Gas Efficiency

| Node Count | Estimated Gas | Actual Usage | Status |
| ---------- | ------------- | ------------ | ------ |
| 1 node     | 600,000       | ~520k        | ✅     |
| 3 nodes    | 600,000       | ~653k        | ✅     |
| 100 nodes  | 640,500       | N/A          | Scaled |

## 🔒 Security Model

### Multi-Layer Security

1. **Biometric Authentication**
   - FIDO2-compliant WebAuthn with mandatory user verification
   - No password-only access for sensitive operations
   - Multi-device passkey support

2. **KMS Key Management**
   - Production wallets managed in secure KMS environment
   - Private keys never exposed to application layer
   - Automatic wallet generation on user registration

3. **Unified Ownership**
   - User wallet = creator = signer (no third-party deployer)
   - Full account control from genesis
   - Simplified trust model

4. **Smart Contract Security**
   - Dual verification (AA + BLS)
   - Time locks (validAfter/validUntil)
   - Nonce-based replay protection
   - Owner-only critical operations

## 📁 Project Structure

```
YetAnotherAA/
├── aastar/                 # Backend API (NestJS)
│   ├── auth/                   # WebAuthn authentication
│   ├── kms/                    # KMS integration
│   └── transfer/               # ERC-4337 transaction service
└── aastar-frontend/        # Frontend (Next.js)
    └── app/                    # Biometric authentication UI
```

**Note**: Smart contracts (Solidity) and BLS signing service are maintained in
separate repositories:

- Validator contracts:
  [YetAnotherAA-Validator](https://github.com/fanhousanbu/YetAnotherAA-Validator)
- BLS Signer: Remote service at https://yetanotheraa-validator.onrender.com

## 🎓 What You'll Learn

This project demonstrates:

- **Modern Cryptography**: BLS12-381 pairing-based signatures and aggregation
- **Account Abstraction**: ERC-4337 implementation with multiple EntryPoint
  versions
- **Biometric Auth**: Production-grade WebAuthn/Passkey integration
- **Key Management**: Enterprise KMS integration for secure key storage
- **Gas Optimization**: Dynamic calculation based on EIP-2537 standards
- **System Design**: Full-stack blockchain application with multiple services

## 🚀 Deployment

### Docker Production Deployment

```bash
# Run with environment variables
docker run -p 80:80 \
  -e KMS_ENABLED=true \
  -e KMS_ENDPOINT=https://kms.your-domain.com \
  -e BLS_SEED_NODES=https://yetanotheraa-validator.onrender.com \
  -e DATABASE_TYPE=postgres \
  -e DATABASE_HOST=your-db-host \
  -e DATABASE_PORT=5432 \
  -e DATABASE_NAME=aastar \
  -e DATABASE_USERNAME=your-user \
  -e DATABASE_PASSWORD=your-password \
  -e ENTRY_POINT_V7_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  -e AASTAR_ACCOUNT_FACTORY_V7_ADDRESS=0xYourFactoryAddress \
  -e VALIDATOR_CONTRACT_V7_ADDRESS=0xYourValidatorAddress \
  -e BUNDLER_RPC_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_API_KEY \
  yaaa:latest

# Or use docker-compose (recommended)
docker-compose up -d
```

> **Note**: The BLS signing service is hosted separately. Use `BLS_SEED_NODES`
> to configure the endpoint.

### Reference Deployment (Sepolia Testnet)

For testing purposes only:

- **AAStarValidator**: `0xD9756c11686B59F7DDf39E6360230316710485af`
- **AAStarAccountFactory (v0.6)**: `0xab18406D34B918A0431116755C45AC7af99DcDa6`
- **AAStarAccountFactory (v0.7)**: `0xAae813Ae38418f38701142cEab08D4F52383bF34`
- **EntryPoint v0.6**: `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
- **EntryPoint v0.7**: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

> **⚠️ Production**: Deploy your own contracts. Private keys only needed for
> contract deployment - runtime wallets are KMS-managed.

### Smart Contract Deployment

Smart contracts are maintained in a separate repository. See
[YetAnotherAA-Validator](https://github.com/fanhousanbu/YetAnotherAA-Validator)
for deployment instructions.

```bash
# Clone validator repository
git clone https://github.com/fanhousanbu/YetAnotherAA-Validator.git
cd YetAnotherAA-Validator

# Compile contracts
forge build

# Deploy validator and factory contracts (one-time)
forge script script/DeployValidator.s.sol \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

## 🌟 Enhanced Features

- ✅ **Docker Deployment**: One-click build and run, production-ready
- ✅ **Zero Configuration**: No private keys needed for operation
- ✅ **Gasless Deployment**: Account creation requires zero ETH
- ✅ **Multi-Version Support**: EntryPoint v0.6, v0.7, v0.8
- ✅ **KMS Integration**: Production-grade key management
- ✅ **Unified Ownership**: User wallet controls everything
- ✅ **Real-time Gossip**: Automatic BLS node discovery
- ✅ **Full Stack**: Complete monorepo with all components

## 🔧 Requirements

- **Node.js**: >= 20.19.0
- **npm**: >= 10.0.0
- **Docker**: >= 20.10 (for Docker deployment)
- **Foundry**: Latest version (for contract development)
- **HTTPS**: WebAuthn requires HTTPS (or localhost)

## 🐳 Docker Configuration

The project includes complete Docker configuration with the following features:

- **Multi-stage Build**: Optimized image size
- **PM2 Process Management**: Auto-restart and load balancing
- **Health Check**: Container health monitoring
- **Environment Variables**: Flexible production configuration

### Dockerfile Architecture

```dockerfile
FROM node:20.19.0-alpine
RUN npm install -g pm2 && apk add --no-cache git
COPY . .
RUN npm ci --include=dev --force
RUN npm run build -w aastar && npm run build -w aastar-frontend
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

**Services managed by PM2:**

- `aastar-backend` - Backend API (port 3000)
- `aastar-frontend` - Next.js frontend (port 80)

**External dependencies:**

- BLS Signer: https://yetanotheraa-validator.onrender.com
- KMS Service: Configured via `KMS_ENDPOINT`
- Bundler: Configured via `BUNDLER_RPC_URL`

### View Container Logs

```bash
# View all service logs
docker logs -f <container_id>

# View specific service
docker exec <container_id> pm2 logs

# Real-time monitoring
docker exec <container_id> pm2 monit
```

## 🏛️ AAStar Management Portal

The `feature/aastar-management-portal` branch adds a **multi-role management interface** for the AAStar ecosystem, integrating live Sepolia on-chain data via `@aastar/core`.

### New Frontend Routes

| Route | Role | Description |
|-------|------|-------------|
| `/role` | Any | Check roles for any address, navigate to role portals |
| `/community` | Community Admin | Status, token info, address lookup, member list |
| `/operator` | SPO / V4 Operator | SPO + V4 status, metric cards, registration guides |
| `/admin` | Protocol Admin | Registry stats, role configs, GToken stats, all addresses |
| `/sale` | Any | GToken bonding-curve price chart, aPNTs fixed-price calculator |

All routes are included in both desktop nav and mobile bottom nav.

### Starting the App (with Management Portal)

The existing start commands automatically include all new modules — no extra steps needed:

```bash
# Install dependencies (once)
npm install

# Start backend (port 3000) — includes registry, community, operator, admin, sale modules
npm run start:dev -w aastar

# Start frontend (port 8080) — includes all 5 new routes
npm run dev -w aastar-frontend
```

### Required Environment Variables

Copy `.env.example` to `aastar/.env` and fill in:

```bash
# AAStar contract addresses — already set in .env for Sepolia canonical values
# Management portal reads these automatically via applyConfig() from @aastar/core

# Only needed for /sale portal (shows "not configured" if absent)
GTOKEN_SALE_ADDRESS=0x...    # GTokenSaleContract (bonding curve) — deploy first
APNTS_SALE_ADDRESS=0x...     # APNTsSaleContract (fixed price $0.02) — deploy first
```

See `aastar/env.sepolia.example` for all Sepolia contract addresses.

### New API Endpoints

```
GET /api/v1/registry/info          — role counts (community/SPO/V4/enduser)
GET /api/v1/registry/role?address= — user role flags
GET /api/v1/community/list         — all community admins + xPNTs token info
GET /api/v1/community/dashboard    — community admin dashboard (JWT)
GET /api/v1/operator/spo/list      — all SPO operators
GET /api/v1/operator/v4/list       — all V4 operators
GET /api/v1/operator/dashboard     — operator dashboard (JWT)
GET /api/v1/admin/protocol         — registry stats + role counts
GET /api/v1/admin/roles            — role configs (minStake, exitFeePercent)
GET /api/v1/admin/gtoken           — GToken total supply + staking balance
GET /api/v1/sale/overview          — GToken + aPNTs sale status
GET /api/v1/sale/gtoken/status     — price, stage, sold%, eligibility
GET /api/v1/sale/apnts/quote?usdAmount= — aPNTs amount for USD input
```

### Test Results

```
NestJS unit tests:  34/34 PASS  (registry, community, operator, admin, sale)
Foundry tests:      62/62 PASS  (SaleContract 24 + GovernanceToken 10 + APNTsSaleContract 28)
Frontend build:     18 routes compiled successfully (Next.js)
```

See [`MANAGEMENT_PORTAL_ACCEPTANCE.md`](MANAGEMENT_PORTAL_ACCEPTANCE.md) for the full acceptance report.

---

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

**Status**: **Network**: Sepolia Testnet | **Security**: WebAuthn + KMS Enhanced

## License

Licensed under the [Apache License, Version 2.0](https://opensource.org/licenses/Apache-2.0). See [LICENSE](./LICENSE) for details.


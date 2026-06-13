export interface User {
  id: string;
  email: string;
  username: string;
  walletAddress?: string;
  createdAt: string;
}

export enum EntryPointVersion {
  V0_6 = "0.6",
  V0_7 = "0.7",
  // V0_8 = "0.8", // Temporarily disabled until EntryPoint 0.8 is deployed
}

export interface Account {
  userId: string;
  address: string;
  creatorAddress: string;
  signerAddress: string;
  salt: number;
  deployed: boolean;
  deploymentTxHash?: string;
  sponsored: boolean;
  sponsorTxHash?: string;
  validatorAddress: string;
  entryPointVersion?: string;
  factoryAddress?: string;
  balance?: string;
  nonce?: string;
  createdAt: string;
  /**
   * Daily transfer limit in wei (decimal string). Present only when the account
   * was created with on-chain guard enforcement via dailyLimit option.
   */
  dailyLimit?: string;
}

export interface Transfer {
  id: string;
  userId: string;
  from: string;
  to: string;
  amount: string;
  data?: string;
  userOpHash: string;
  bundlerUserOpHash?: string;
  transactionHash?: string;
  status: "pending" | "submitted" | "completed" | "failed";
  nodeIndices: number[];
  error?: string;
  tokenSymbol?: string;
  createdAt: string;
  completedAt?: string;
}

export interface BlsNode {
  index: number;
  nodeId: string;
  nodeName: string;
  status: string;
}

export interface GasEstimate {
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  validatorGasEstimate: string;
  totalGasEstimate: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

// ERC20 Token types
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  isCustom?: boolean;
  chainId?: number;
}

export interface TokenBalance {
  token?: Token;
  balance: string;
  formattedBalance: string;
  decimals?: number;
  usdValue?: string;
}

export interface TokenStats {
  total: number;
  custom: number;
}

export interface TokenFilters {
  customOnly?: boolean;
  query?: string;
}

export interface TokenTransfer extends Omit<Transfer, "amount"> {
  tokenAddress?: string;
  tokenAmount?: string;
  tokenSymbol?: string;
  amount: string; // For ETH transfers, this is ETH amount; for token transfers, this is "0"
}

// User Token types
export interface UserToken {
  id: string;
  userId: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  isCustom: boolean;
  chainId?: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface UserTokenWithBalance extends UserToken {
  balance?: TokenBalance;
}

// NFT types
export enum NFTStandard {
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
}

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: any }>;
  [key: string]: any;
}

export interface UserNFT {
  id: string;
  userId: string;
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  collectionName?: string;
  standard: NFTStandard;
  amount?: number;
  chainId?: number;
  isActive: boolean;
  metadata?: NFTMetadata;
  createdAt: string;
}

export interface NFTStats {
  total: number;
  erc721: number;
  erc1155: number;
  collections: number;
}

export interface NFTFilters {
  query?: string;
  contractAddress?: string;
  standard?: NFTStandard;
  activeOnly?: boolean;
}

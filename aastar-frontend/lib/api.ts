import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(config => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/auth/login";
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data: { email: string; password: string; username?: string }) =>
    api.post("/auth/register", data),

  login: (data: { email: string; password: string }) => api.post("/auth/login", data),

  getProfile: () => api.get("/auth/profile"),

  // KMS Passkey login
  beginKmsLogin: (email: string) => api.post("/auth/login/kms/begin", { email }),

  completeKmsLogin: (data: { address: string; challengeId: string; credential: any }) =>
    api.post("/auth/login/kms/complete", data),

  // Wallet linking (JWT-protected)
  linkWallet: (data: { kmsKeyId: string; address: string; credentialId?: string }) =>
    api.post("/auth/wallet/link", data),
};

// Account API
export const accountAPI = {
  create: (data: {
    deploy?: boolean;
    fundAmount?: string;
    salt?: number;
    entryPointVersion?: string;
  }) => api.post("/account/create", data),

  getAccount: () => api.get("/account"),

  getBalance: () => api.get("/account/balance"),

  getNonce: () => api.get("/account/nonce"),

  // fundAccount and sponsorAccount removed - not needed with Paymaster
  // All transactions are sponsored automatically

  // Guardian setup flow (M7)
  prepareGuardianSetup: (data: { entryPointVersion?: string; salt?: number }) =>
    api.post("/account/guardian-setup/prepare", data),

  createWithGuardians: (data: {
    guardian1: string;
    guardian1Sig: string;
    guardian2: string;
    guardian2Sig: string;
    dailyLimit: string;
    salt?: number;
    entryPointVersion?: string;
  }) => api.post("/account/create-with-guardians", data),
};

// Transfer API
export const transferAPI = {
  execute: (data: {
    to: string;
    amount: string;
    data?: string;
    usePaymaster?: boolean;
    paymasterAddress?: string;
    paymasterData?: string;
    tokenAddress?: string;
    passkeyAssertion: {
      AuthenticatorData: string;
      ClientDataHash: string;
      Signature: string;
    };
  }) => api.post("/transfer/execute", data),

  estimate: (data: {
    to: string;
    amount: string;
    data?: string;
    nodeIndices?: number[];
    usePaymaster?: boolean;
    tokenAddress?: string;
  }) => api.post("/transfer/estimate", data),

  getStatus: (id: string) => api.get(`/transfer/status/${id}`),

  getHistory: (page: number = 1, limit: number = 10) =>
    api.get(`/transfer/history?page=${page}&limit=${limit}`),
};

// BLS API
export const blsAPI = {
  getNodes: () => api.get("/bls/nodes"),

  generateSignature: (data: { userOpHash: string; nodeIndices?: number[] }) =>
    api.post("/bls/sign", data),
};

// Paymaster API
export const paymasterAPI = {
  getAvailable: () => api.get("/paymaster/available"),

  sponsor: (data: { paymasterName: string; userOp: any; entryPoint?: string }) =>
    api.post("/paymaster/sponsor", data),

  addCustom: (data: {
    name: string;
    address: string;
    type?: "pimlico" | "stackup" | "alchemy" | "custom";
    apiKey?: string;
    endpoint?: string;
  }) => api.post("/paymaster/add", data),

  remove: (name: string) => api.delete(`/paymaster/${name}`),
};

// Token API
export const tokenAPI = {
  getPresetTokens: () => api.get("/tokens/preset"),

  getTokenInfo: (address: string) => api.get(`/tokens/info/${address}`),

  validateToken: (data: { address: string }) => api.post("/tokens/validate", data),

  getTokenBalance: (address: string) => api.get(`/tokens/balance/${address}`),

  getTokenBalances: (accountAddress?: string) => {
    const params = accountAddress ? { address: accountAddress } : {};
    return api.get("/tokens/balances", { params });
  },

  getAllTokenBalances: (accountAddress?: string) => {
    const params = accountAddress ? { address: accountAddress } : {};
    return api.get("/tokens/balances", { params });
  },

  getNonZeroBalances: () => api.get("/tokens/balances/non-zero"),

  getTokenStats: () => api.get("/tokens/stats"),

  searchTokens: (params: { query?: string; customOnly?: boolean }) =>
    api.get("/tokens/search", { params }),
};

// User Token API
export const userTokenAPI = {
  getUserTokens: (params?: { activeOnly?: boolean; withBalances?: boolean }) =>
    api.get("/user-tokens", { params }),

  addUserToken: (data: {
    address: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    logoUrl?: string;
  }) => api.post("/user-tokens", data),

  updateUserToken: (
    tokenId: string,
    data: {
      isActive?: boolean;
      sortOrder?: number;
      logoUrl?: string;
    }
  ) => api.put(`/user-tokens/${tokenId}`, data),

  removeUserToken: (tokenId: string) => api.delete(`/user-tokens/${tokenId}`),

  deleteUserToken: (tokenId: string) => api.delete(`/user-tokens/${tokenId}/permanent`),

  searchUserTokens: (params: { query?: string; customOnly?: boolean; activeOnly?: boolean }) =>
    api.get("/user-tokens/search", { params }),

  initializeDefaultTokens: () => api.post("/user-tokens/initialize-defaults"),

  updateTokensOrder: (tokenOrders: { tokenId: string; sortOrder: number }[]) =>
    api.put("/user-tokens/reorder", { tokenOrders }),
};

// Guardian & Recovery API
export const guardianAPI = {
  getGuardians: (accountAddress: string) => api.get(`/guardian/${accountAddress}`),

  addGuardian: (data: { guardianAddress: string }) => api.post("/guardian/add", data),

  removeGuardian: (data: { guardianAddress: string }) => api.delete("/guardian/remove", { data }),

  initiateRecovery: (data: { accountAddress: string; newSignerAddress: string }) =>
    api.post("/guardian/recovery/initiate", data),

  supportRecovery: (data: { accountAddress: string }) =>
    api.post("/guardian/recovery/support", data),

  executeRecovery: (data: { accountAddress: string }) =>
    api.post("/guardian/recovery/execute", data),

  cancelRecovery: (data: { accountAddress: string }) => api.post("/guardian/recovery/cancel", data),

  getPendingRecovery: (accountAddress: string) => api.get(`/guardian/recovery/${accountAddress}`),
};

export const addressBookAPI = {
  getAddressBook: () => api.get("/address-book"),
  setAddressName: (address: string, name: string) =>
    api.post("/address-book/name", { address, name }),
  removeAddress: (address: string) => api.delete(`/address-book/${address}`),
  searchAddresses: (query: string) => api.get("/address-book/search", { params: { q: query } }),
};

// User NFT API
export const userNFTAPI = {
  getUserNFTs: (params?: { activeOnly?: boolean }) => api.get("/user-nfts", { params }),

  getNFTStats: () => api.get("/user-nfts/stats"),

  getNFTsByCollection: (contractAddress: string) =>
    api.get(`/user-nfts/collection/${contractAddress}`),

  addUserNFT: (data: {
    contractAddress: string;
    tokenId: string;
    standard?: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    collectionName?: string;
    amount?: number;
  }) => api.post("/user-nfts", data),

  updateUserNFT: (
    nftId: string,
    data: {
      isActive?: boolean;
      name?: string;
      description?: string;
      imageUrl?: string;
    }
  ) => api.put(`/user-nfts/${nftId}`, data),

  removeUserNFT: (nftId: string) => api.delete(`/user-nfts/${nftId}`),

  deleteUserNFT: (nftId: string) => api.delete(`/user-nfts/${nftId}/permanent`),

  searchUserNFTs: (params: {
    query?: string;
    contractAddress?: string;
    standard?: string;
    activeOnly?: boolean;
  }) => api.get("/user-nfts/search", { params }),

  verifyNFTOwnership: (data: { contractAddress: string; tokenId: string; standard: string }) =>
    api.post("/user-nfts/verify-ownership", data),
};

// Registry API
export const registryAPI = {
  getInfo: () => api.get("/registry/info"),
  getRoleIds: () => api.get("/registry/role-ids"),
  getRole: (address?: string) =>
    api.get("/registry/role", { params: address ? { address } : undefined }),
  getMembers: (roleId: string) => api.get("/registry/members", { params: { roleId } }),
  getCommunity: (name: string) => api.get("/registry/community", { params: { name } }),
};

// Sale API
export const saleAPI = {
  getOverview: () => api.get("/sale/overview"),
  getGTokenStatus: () => api.get("/sale/gtoken/status"),
  getAPNTsStatus: () => api.get("/sale/apnts/status"),
  getAPNTsQuote: (usdAmount: string) => api.get("/sale/apnts/quote", { params: { usdAmount } }),
  getGTokenEvents: () => api.get("/sale/gtoken/events"),
  getGTokenEligibility: (address?: string) =>
    api.get("/sale/gtoken/eligibility", { params: address ? { address } : undefined }),
  getAddresses: () => api.get("/sale/addresses"),
};

// Admin API
export const adminAPI = {
  getProtocol: () => api.get("/admin/protocol"),
  getRoles: () => api.get("/admin/roles"),
  getGToken: () => api.get("/admin/gtoken"),
  getDashboard: () => api.get("/admin/dashboard"),
};

// Operator API
export const operatorAPI = {
  getAddresses: () => api.get("/operator/addresses"),
  getSPOList: () => api.get("/operator/spo/list"),
  getV4List: () => api.get("/operator/v4/list"),
  getStatus: (address: string) => api.get("/operator/status", { params: { address } }),
  getDashboard: (address?: string) =>
    api.get("/operator/dashboard", { params: address ? { address } : undefined }),
  getGTokenBalance: (address?: string) =>
    api.get("/operator/gtoken-balance", { params: address ? { address } : undefined }),
};

// Community API
export const communityAPI = {
  getList: () => api.get("/community/list"),
  getAddresses: () => api.get("/community/addresses"),
  getInfo: (address: string) => api.get("/community/info", { params: { address } }),
  getToken: (address: string) => api.get("/community/token", { params: { address } }),
  getDashboard: (address?: string) =>
    api.get("/community/dashboard", { params: address ? { address } : undefined }),
  getGTokenBalance: (address?: string) =>
    api.get("/community/gtoken-balance", { params: address ? { address } : undefined }),
};

export default api;

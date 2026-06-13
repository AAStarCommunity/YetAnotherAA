import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { YAAAServerClient } from "@aastar/airaccount/server";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";

export enum TokenCategory {
  STABLECOIN = "stablecoin",
  DEFI = "defi",
  GOVERNANCE = "governance",
  UTILITY = "utility",
  TEST = "test",
  OTHER = "other",
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  isCustom?: boolean;
  chainId?: number;
  category?: TokenCategory;
  description?: string;
  website?: string;
  verified?: boolean;
  tags?: string[];
}

export interface TokenBalance {
  token: Token;
  balance: string;
  formattedBalance: string;
}

@Injectable()
export class TokenService {
  private provider: ethers.JsonRpcProvider;

  // Pre-configured tokens for OP Mainnet
  private readonly PRESET_TOKENS: Token[] = [
    {
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/825.png",
      isCustom: false,
      chainId: 10,
      category: TokenCategory.STABLECOIN,
      description: "Tether USD stablecoin on Optimism",
      website: "https://tether.to",
      verified: true,
      tags: ["stablecoin", "tether"],
    },
    {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/3408.png",
      isCustom: false,
      chainId: 10,
      category: TokenCategory.STABLECOIN,
      description: "Native USDC on Optimism",
      website: "https://circle.com",
      verified: true,
      tags: ["stablecoin", "circle"],
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/4943.png",
      isCustom: false,
      chainId: 10,
      category: TokenCategory.STABLECOIN,
      description: "Decentralized USD-pegged stablecoin",
      website: "https://makerdao.com",
      verified: true,
      tags: ["stablecoin", "defi"],
    },
    {
      address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6",
      symbol: "LINK",
      name: "ChainLink Token",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/1975.png",
      isCustom: false,
      chainId: 10,
      category: TokenCategory.DEFI,
      description: "Decentralized oracle network token",
      website: "https://chain.link",
      verified: true,
      tags: ["oracle", "defi"],
    },
    {
      address: "0x6fd9d7AD17242c41f7131d257212c54A0e816691",
      symbol: "UNI",
      name: "Uniswap Token",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/7083.png",
      isCustom: false,
      chainId: 10,
      category: TokenCategory.GOVERNANCE,
      description: "Uniswap protocol governance token",
      website: "https://uniswap.org",
      verified: true,
      tags: ["governance", "dex"],
    },
    {
      address: "0x4200000000000000000000000000000000000042",
      symbol: "OP",
      name: "Optimism",
      decimals: 18,
      logoUrl: "https://s2.coinmarketcap.com/static/img/coins/32x32/11840.png",
      isCustom: false,
      chainId: 10,
      category: TokenCategory.GOVERNANCE,
      description: "Optimism governance token",
      website: "https://optimism.io",
      verified: true,
      tags: ["governance", "l2"],
    },
  ];

  private chainId: number;

  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private configService: ConfigService
  ) {
    this.provider = new ethers.JsonRpcProvider(this.configService.get<string>("ethRpcUrl"));
    this.chainId = this.configService.get<number>("chainId") || 10;
  }

  // ---- Preset token methods (backend-specific local data) ----

  getPresetTokens(): Token[] {
    return this.PRESET_TOKENS;
  }

  getTokensByCategory(category: TokenCategory): Token[] {
    return this.PRESET_TOKENS.filter(token => token.category === category);
  }

  searchTokens(query: string): Token[] {
    const searchTerm = query.toLowerCase().trim();
    if (!searchTerm) return this.PRESET_TOKENS;

    return this.PRESET_TOKENS.filter(
      token =>
        token.symbol.toLowerCase().includes(searchTerm) ||
        token.name.toLowerCase().includes(searchTerm) ||
        token.address.toLowerCase().includes(searchTerm) ||
        token.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
    );
  }

  getTokenCategories(): TokenCategory[] {
    return Object.values(TokenCategory);
  }

  getFilteredTokens(filters: {
    category?: TokenCategory;
    verified?: boolean;
    customOnly?: boolean;
    query?: string;
  }): Token[] {
    let tokens = this.PRESET_TOKENS;

    if (filters.customOnly !== undefined) {
      tokens = tokens.filter(token => token.isCustom === filters.customOnly);
    }
    if (filters.category) {
      tokens = tokens.filter(token => token.category === filters.category);
    }
    if (filters.verified !== undefined) {
      tokens = tokens.filter(token => token.verified === filters.verified);
    }
    if (filters.query) {
      const searchTerm = filters.query.toLowerCase().trim();
      tokens = tokens.filter(
        token =>
          token.symbol.toLowerCase().includes(searchTerm) ||
          token.name.toLowerCase().includes(searchTerm) ||
          token.address.toLowerCase().includes(searchTerm) ||
          token.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    return tokens;
  }

  getTokenByAddress(address: string): Token | undefined {
    return this.PRESET_TOKENS.find(token => token.address.toLowerCase() === address.toLowerCase());
  }

  getTokenStats(): {
    total: number;
    byCategory: Record<TokenCategory, number>;
    verified: number;
    custom: number;
  } {
    const stats = {
      total: this.PRESET_TOKENS.length,
      byCategory: {} as Record<TokenCategory, number>,
      verified: 0,
      custom: 0,
    };

    Object.values(TokenCategory).forEach(category => {
      stats.byCategory[category] = 0;
    });

    this.PRESET_TOKENS.forEach(token => {
      if (token.category) {
        stats.byCategory[token.category]++;
      }
      if (token.verified) {
        stats.verified++;
      }
      if (token.isCustom) {
        stats.custom++;
      }
    });

    return stats;
  }

  formatTokenAmount(amount: string, decimals: number, precision = 6): string {
    const formatted = ethers.formatUnits(amount, decimals);
    const num = parseFloat(formatted);

    if (num === 0) return "0";
    if (num >= 1) return num.toFixed(Math.min(4, precision));
    if (num >= 0.0001) return num.toFixed(precision);
    return num.toExponential(2);
  }

  // ---- On-chain queries (delegated to SDK) ----

  async getTokenInfo(tokenAddress: string): Promise<Token> {
    const sdkInfo = await this.client.tokens.getTokenInfo(tokenAddress);
    return {
      address: sdkInfo.address,
      name: sdkInfo.name,
      symbol: sdkInfo.symbol,
      decimals: sdkInfo.decimals,
      isCustom: true,
      chainId: this.chainId,
      category: TokenCategory.OTHER,
      verified: false,
      tags: ["custom"],
    };
  }

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    return this.client.tokens.getTokenBalance(tokenAddress, walletAddress);
  }

  async getFormattedTokenBalance(
    tokenAddress: string,
    walletAddress: string
  ): Promise<TokenBalance> {
    const sdkBalance = await this.client.tokens.getFormattedTokenBalance(
      tokenAddress,
      walletAddress
    );
    return {
      token: {
        address: sdkBalance.token.address,
        name: sdkBalance.token.name,
        symbol: sdkBalance.token.symbol,
        decimals: sdkBalance.token.decimals,
        isCustom: true,
        chainId: this.chainId,
        category: TokenCategory.OTHER,
        verified: false,
        tags: ["custom"],
      },
      balance: sdkBalance.balance,
      formattedBalance: sdkBalance.formattedBalance,
    };
  }

  generateTransferCalldata(to: string, amount: string, decimals: number): string {
    return this.client.tokens.generateTransferCalldata(to, amount, decimals);
  }

  async validateToken(tokenAddress: string): Promise<{
    isValid: boolean;
    token?: Token;
    error?: string;
  }> {
    // Check preset tokens first
    const existingToken = this.getTokenByAddress(tokenAddress);
    if (existingToken) {
      return { isValid: true, token: existingToken };
    }

    const result = await this.client.tokens.validateToken(tokenAddress);
    if (result.isValid && result.token) {
      return {
        isValid: true,
        token: {
          address: result.token.address,
          name: result.token.name,
          symbol: result.token.symbol,
          decimals: result.token.decimals,
          isCustom: true,
          chainId: this.chainId,
          category: TokenCategory.OTHER,
          verified: false,
          tags: ["custom"],
        },
      };
    }

    return { isValid: false, error: result.error };
  }

  // ---- Backend-specific: bulk balance loading with rate limiting ----

  async getAllTokenBalances(
    walletAddress: string,
    includeZeroBalances = true
  ): Promise<TokenBalance[]> {
    const tokens = this.PRESET_TOKENS;
    const balances: TokenBalance[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      try {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const rawBalance = await this.client.tokens.getTokenBalance(token.address, walletAddress);
        const formattedBalance = ethers.formatUnits(rawBalance, token.decimals);

        if (!includeZeroBalances && parseFloat(formattedBalance) === 0) {
          continue;
        }

        balances.push({ token, balance: rawBalance, formattedBalance });
      } catch (error) {
        console.error(`Failed to load balance for ${token.symbol}:`, error.message);
        if (includeZeroBalances) {
          balances.push({ token, balance: "0", formattedBalance: "0" });
        }
      }
    }

    return balances.sort((a, b) => {
      const balanceA = parseFloat(a.formattedBalance);
      const balanceB = parseFloat(b.formattedBalance);
      if (balanceA !== balanceB) return balanceB - balanceA;
      return a.token.symbol.localeCompare(b.token.symbol);
    });
  }
}

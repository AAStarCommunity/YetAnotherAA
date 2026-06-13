import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { UserToken } from "../entities/user-token.entity";
import { TokenService } from "../token/token.service";
import * as fs from "fs";
import * as path from "path";

export interface CreateUserTokenDto {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoUrl?: string;
}

export interface UpdateUserTokenDto {
  isActive?: boolean;
  sortOrder?: number;
  logoUrl?: string;
}

@Injectable()
export class UserTokenService {
  private provider: ethers.JsonRpcProvider;
  private dataDir: string;

  // ERC20 ABI for basic token operations
  private readonly ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ];

  constructor(
    private configService: ConfigService,
    private tokenService: TokenService
  ) {
    this.provider = new ethers.JsonRpcProvider(this.configService.get<string>("ethRpcUrl"));
    this.dataDir = path.join(process.cwd(), "data");

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get user tokens file path
   */
  private getUserTokensFilePath(userId: string): string {
    return path.join(this.dataDir, `user-tokens-${userId}.json`);
  }

  /**
   * Load user tokens from JSON file
   */
  private async loadUserTokensFromFile(userId: string): Promise<UserToken[]> {
    const filePath = this.getUserTokensFilePath(userId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (_error) {
      console.error("Error loading user tokens from file:", _error);
      return [];
    }
  }

  /**
   * Save user tokens to JSON file
   */
  private async saveUserTokensToFile(userId: string, tokens: UserToken[]): Promise<void> {
    const filePath = this.getUserTokensFilePath(userId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2));
    } catch (_error) {
      console.error("Error saving user tokens to file:", _error);
      throw new Error("Failed to save user tokens");
    }
  }

  /**
   * Initialize default tokens for a new user
   */
  async initializeDefaultTokens(userId: string): Promise<UserToken[]> {
    const presetTokens = this.tokenService.getPresetTokens();
    const userTokens: UserToken[] = [];

    let sortOrder = 0;
    for (const presetToken of presetTokens) {
      const userToken: UserToken = {
        id: `${userId}-${presetToken.address}-${Date.now()}-${sortOrder}`,
        userId,
        address: presetToken.address,
        symbol: presetToken.symbol,
        name: presetToken.name,
        decimals: presetToken.decimals,
        logoUrl: presetToken.logoUrl,
        isCustom: false,
        chainId: presetToken.chainId,
        isActive: true,
        sortOrder: sortOrder++,
        createdAt: new Date().toISOString(),
        user: null,
      };

      userTokens.push(userToken);
    }

    await this.saveUserTokensToFile(userId, userTokens);
    return userTokens;
  }

  /**
   * Get all tokens for a user
   */
  async getUserTokens(userId: string, activeOnly: boolean = true): Promise<UserToken[]> {
    let tokens = await this.loadUserTokensFromFile(userId);

    // If no tokens found, return empty array instead of throwing error
    if (!tokens || tokens.length === 0) {
      return [];
    }

    if (activeOnly) {
      tokens = tokens.filter(token => token.isActive);
    }

    // Sort tokens
    tokens.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return tokens;
  }

  /**
   * Get user tokens with balances
   */
  async getUserTokensWithBalances(userId: string, accountAddress: string): Promise<any[]> {
    const userTokens = await this.getUserTokens(userId);
    const tokensWithBalances = [];

    for (const userToken of userTokens) {
      try {
        const balance = await this.tokenService.getFormattedTokenBalance(
          userToken.address,
          accountAddress
        );
        tokensWithBalances.push({
          ...userToken,
          balance,
        });
      } catch (_error) {
        // If balance fetch fails, still include the token without balance
        tokensWithBalances.push({
          ...userToken,
          balance: null,
        });
      }
    }

    return tokensWithBalances;
  }

  /**
   * Add a custom token for a user
   */
  async addUserToken(userId: string, tokenData: CreateUserTokenDto): Promise<UserToken> {
    const tokens = await this.loadUserTokensFromFile(userId);

    const existingToken = tokens.find(
      token => token.address.toLowerCase() === tokenData.address.toLowerCase()
    );

    if (existingToken) {
      if (!existingToken.isActive) {
        existingToken.isActive = true;
        await this.saveUserTokensToFile(userId, tokens);
        return existingToken;
      } else {
        throw new BadRequestException("Token already exists in your list");
      }
    }

    // If token data is not provided, try to fetch from blockchain
    if (!tokenData.symbol || !tokenData.name || !tokenData.decimals) {
      try {
        const tokenInfo = await this.getTokenInfoFromChain(tokenData.address);
        tokenData.symbol = tokenData.symbol || tokenInfo.symbol;
        tokenData.name = tokenData.name || tokenInfo.name;
        tokenData.decimals = tokenData.decimals || tokenInfo.decimals;
      } catch (_error) {
        throw new BadRequestException("Could not fetch token information from blockchain");
      }
    }

    const maxSortOrder = Math.max(0, ...tokens.map(t => t.sortOrder));

    const userToken: UserToken = {
      id: `${userId}-${tokenData.address}-${Date.now()}`,
      userId,
      address: tokenData.address.toLowerCase(),
      symbol: tokenData.symbol,
      name: tokenData.name,
      decimals: tokenData.decimals,
      logoUrl: tokenData.logoUrl,
      isCustom: true,
      chainId: this.configService.get<number>("chainId", 10),
      isActive: true,
      sortOrder: maxSortOrder + 1,
      createdAt: new Date().toISOString(),
      user: null,
    };

    tokens.push(userToken);
    await this.saveUserTokensToFile(userId, tokens);
    return userToken;
  }

  /**
   * Update a user token
   */
  async updateUserToken(
    userId: string,
    tokenId: string,
    updateData: UpdateUserTokenDto
  ): Promise<UserToken> {
    const tokens = await this.loadUserTokensFromFile(userId);
    const tokenIndex = tokens.findIndex(token => token.id === tokenId);

    if (tokenIndex === -1) {
      throw new NotFoundException("Token not found");
    }

    Object.assign(tokens[tokenIndex], updateData);
    await this.saveUserTokensToFile(userId, tokens);
    return tokens[tokenIndex];
  }

  /**
   * Remove a token from user's list (soft delete by setting isActive to false)
   */
  async removeUserToken(userId: string, tokenId: string): Promise<void> {
    const tokens = await this.loadUserTokensFromFile(userId);
    const tokenIndex = tokens.findIndex(token => token.id === tokenId);

    if (tokenIndex === -1) {
      throw new NotFoundException("Token not found");
    }

    tokens[tokenIndex].isActive = false;
    await this.saveUserTokensToFile(userId, tokens);
  }

  /**
   * Hard delete a token from user's list
   */
  async deleteUserToken(userId: string, tokenId: string): Promise<void> {
    const tokens = await this.loadUserTokensFromFile(userId);
    const tokenIndex = tokens.findIndex(token => token.id === tokenId);

    if (tokenIndex === -1) {
      throw new NotFoundException("Token not found");
    }

    tokens.splice(tokenIndex, 1);
    await this.saveUserTokensToFile(userId, tokens);
  }

  /**
   * Get token information from blockchain
   */
  private async getTokenInfoFromChain(address: string): Promise<{
    symbol: string;
    name: string;
    decimals: number;
  }> {
    try {
      const contract = new ethers.Contract(address, this.ERC20_ABI, this.provider);

      const [symbol, name, decimals] = await Promise.all([
        contract.symbol(),
        contract.name(),
        contract.decimals(),
      ]);

      return {
        symbol: symbol.toString(),
        name: name.toString(),
        decimals: Number(decimals),
      };
    } catch (_error) {
      throw new BadRequestException("Invalid token contract address");
    }
  }

  /**
   * Search and filter user tokens
   */
  async searchUserTokens(
    userId: string,
    filters: {
      query?: string;
      customOnly?: boolean;
      activeOnly?: boolean;
    }
  ): Promise<UserToken[]> {
    let tokens = await this.loadUserTokensFromFile(userId);

    if (filters.activeOnly !== false) {
      tokens = tokens.filter(token => token.isActive);
    }

    if (filters.query) {
      const query = filters.query.toLowerCase();
      tokens = tokens.filter(
        token =>
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.address.toLowerCase().includes(query)
      );
    }

    if (filters.customOnly !== undefined) {
      tokens = tokens.filter(token => token.isCustom === filters.customOnly);
    }

    return tokens.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }

  /**
   * Update sort order for multiple tokens
   */
  async updateTokensOrder(
    userId: string,
    tokenOrders: { tokenId: string; sortOrder: number }[]
  ): Promise<void> {
    const tokens = await this.loadUserTokensFromFile(userId);

    for (const { tokenId, sortOrder } of tokenOrders) {
      const tokenIndex = tokens.findIndex(token => token.id === tokenId);
      if (tokenIndex >= 0) {
        tokens[tokenIndex].sortOrder = sortOrder;
      }
    }

    await this.saveUserTokensToFile(userId, tokens);
  }
}

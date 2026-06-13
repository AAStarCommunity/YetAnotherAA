import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { UserNFT, NFTStandard } from "../entities/user-nft.entity";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";

export interface CreateUserNFTDto {
  contractAddress: string;
  tokenId: string;
  standard?: NFTStandard;
  name?: string;
  description?: string;
  imageUrl?: string;
  collectionName?: string;
  amount?: number;
}

export interface UpdateUserNFTDto {
  isActive?: boolean;
  name?: string;
  description?: string;
  imageUrl?: string;
}

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: any }>;
  [key: string]: any;
}

@Injectable()
export class UserNFTService {
  private provider: ethers.JsonRpcProvider;
  private dataDir: string;

  // ERC721 ABI
  private readonly ERC721_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function balanceOf(address owner) view returns (uint256)",
  ];

  // ERC1155 ABI
  private readonly ERC1155_ABI = [
    "function uri(uint256 tokenId) view returns (string)",
    "function balanceOf(address account, uint256 id) view returns (uint256)",
  ];

  constructor(private configService: ConfigService) {
    this.provider = new ethers.JsonRpcProvider(this.configService.get<string>("ethRpcUrl"));
    this.dataDir = path.join(process.cwd(), "data");

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get user NFTs file path
   */
  private getUserNFTsFilePath(userId: string): string {
    return path.join(this.dataDir, `user-nfts-${userId}.json`);
  }

  /**
   * Load user NFTs from JSON file
   */
  private async loadUserNFTsFromFile(userId: string): Promise<UserNFT[]> {
    const filePath = this.getUserNFTsFilePath(userId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (_error) {
      console.error("Error loading user NFTs from file:", _error);
      return [];
    }
  }

  /**
   * Save user NFTs to JSON file
   */
  private async saveUserNFTsToFile(userId: string, nfts: UserNFT[]): Promise<void> {
    const filePath = this.getUserNFTsFilePath(userId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(nfts, null, 2));
    } catch (_error) {
      console.error("Error saving user NFTs to file:", _error);
      throw new Error("Failed to save user NFTs");
    }
  }

  /**
   * Get all NFTs for a user
   */
  async getUserNFTs(userId: string, activeOnly: boolean = true): Promise<UserNFT[]> {
    let nfts = await this.loadUserNFTsFromFile(userId);

    if (activeOnly) {
      nfts = nfts.filter(nft => nft.isActive);
    }

    // Sort by creation date
    nfts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return nfts;
  }

  /**
   * Get NFTs by collection
   */
  async getNFTsByCollection(userId: string, contractAddress: string): Promise<UserNFT[]> {
    const nfts = await this.getUserNFTs(userId);
    return nfts.filter(nft => nft.contractAddress.toLowerCase() === contractAddress.toLowerCase());
  }

  /**
   * Add an NFT for a user
   */
  async addUserNFT(userId: string, nftData: CreateUserNFTDto): Promise<UserNFT> {
    const nfts = await this.loadUserNFTsFromFile(userId);

    // Check if NFT already exists
    const existingNFT = nfts.find(
      nft =>
        nft.contractAddress.toLowerCase() === nftData.contractAddress.toLowerCase() &&
        nft.tokenId === nftData.tokenId
    );

    if (existingNFT) {
      if (!existingNFT.isActive) {
        existingNFT.isActive = true;
        await this.saveUserNFTsToFile(userId, nfts);
        return existingNFT;
      } else {
        throw new BadRequestException("NFT already exists in your collection");
      }
    }

    // Determine NFT standard if not provided
    const standard = nftData.standard || (await this.detectNFTStandard(nftData.contractAddress));

    // Fetch NFT metadata
    let metadata: NFTMetadata = {};
    let name = nftData.name;
    let description = nftData.description;
    let imageUrl = nftData.imageUrl;
    let collectionName = nftData.collectionName;

    try {
      metadata = await this.fetchNFTMetadata(nftData.contractAddress, nftData.tokenId, standard);

      name = name || metadata.name || `#${nftData.tokenId}`;
      description = description || metadata.description;
      imageUrl = imageUrl || this.resolveIPFSUrl(metadata.image);

      // Get collection name from contract
      if (!collectionName) {
        try {
          const contract = new ethers.Contract(
            nftData.contractAddress,
            this.ERC721_ABI,
            this.provider
          );
          collectionName = await contract.name();
        } catch (_error) {
          collectionName = "Unknown Collection";
        }
      }
    } catch (_error) {
      console.error("Error fetching NFT metadata:", _error);
      name = name || `#${nftData.tokenId}`;
      collectionName = collectionName || "Unknown Collection";
    }

    const userNFT: UserNFT = {
      id: `${userId}-${nftData.contractAddress}-${nftData.tokenId}-${Date.now()}`,
      userId,
      contractAddress: nftData.contractAddress.toLowerCase(),
      tokenId: nftData.tokenId,
      name,
      description,
      imageUrl,
      collectionName,
      standard,
      amount: nftData.amount || 1,
      chainId: this.configService.get<number>("chainId", 10),
      isActive: true,
      metadata,
      createdAt: new Date().toISOString(),
      user: null,
    };

    nfts.push(userNFT);
    await this.saveUserNFTsToFile(userId, nfts);
    return userNFT;
  }

  /**
   * Update an NFT
   */
  async updateUserNFT(
    userId: string,
    nftId: string,
    updateData: UpdateUserNFTDto
  ): Promise<UserNFT> {
    const nfts = await this.loadUserNFTsFromFile(userId);
    const nftIndex = nfts.findIndex(nft => nft.id === nftId);

    if (nftIndex === -1) {
      throw new NotFoundException("NFT not found");
    }

    Object.assign(nfts[nftIndex], updateData);
    await this.saveUserNFTsToFile(userId, nfts);
    return nfts[nftIndex];
  }

  /**
   * Remove an NFT (soft delete)
   */
  async removeUserNFT(userId: string, nftId: string): Promise<void> {
    const nfts = await this.loadUserNFTsFromFile(userId);
    const nftIndex = nfts.findIndex(nft => nft.id === nftId);

    if (nftIndex === -1) {
      throw new NotFoundException("NFT not found");
    }

    nfts[nftIndex].isActive = false;
    await this.saveUserNFTsToFile(userId, nfts);
  }

  /**
   * Hard delete an NFT
   */
  async deleteUserNFT(userId: string, nftId: string): Promise<void> {
    const nfts = await this.loadUserNFTsFromFile(userId);
    const nftIndex = nfts.findIndex(nft => nft.id === nftId);

    if (nftIndex === -1) {
      throw new NotFoundException("NFT not found");
    }

    nfts.splice(nftIndex, 1);
    await this.saveUserNFTsToFile(userId, nfts);
  }

  /**
   * Verify NFT ownership
   */
  async verifyNFTOwnership(
    contractAddress: string,
    tokenId: string,
    ownerAddress: string,
    standard: NFTStandard
  ): Promise<boolean> {
    try {
      if (standard === NFTStandard.ERC721) {
        const contract = new ethers.Contract(contractAddress, this.ERC721_ABI, this.provider);
        const owner = await contract.ownerOf(tokenId);
        return owner.toLowerCase() === ownerAddress.toLowerCase();
      } else if (standard === NFTStandard.ERC1155) {
        const contract = new ethers.Contract(contractAddress, this.ERC1155_ABI, this.provider);
        const balance = await contract.balanceOf(ownerAddress, tokenId);
        return balance > 0n;
      }
      return false;
    } catch (_error) {
      console.error("Error verifying NFT ownership:", _error);
      return false;
    }
  }

  /**
   * Detect NFT standard (ERC721 or ERC1155)
   */
  private async detectNFTStandard(contractAddress: string): Promise<NFTStandard> {
    try {
      // Try ERC721 first
      const erc721Contract = new ethers.Contract(contractAddress, this.ERC721_ABI, this.provider);
      await erc721Contract.name();
      return NFTStandard.ERC721;
    } catch (_error) {
      // Assume ERC1155 if ERC721 fails
      return NFTStandard.ERC1155;
    }
  }

  /**
   * Fetch NFT metadata from blockchain/IPFS
   */
  private async fetchNFTMetadata(
    contractAddress: string,
    tokenId: string,
    standard: NFTStandard
  ): Promise<NFTMetadata> {
    try {
      let tokenURI = "";

      if (standard === NFTStandard.ERC721) {
        const contract = new ethers.Contract(contractAddress, this.ERC721_ABI, this.provider);
        tokenURI = await contract.tokenURI(tokenId);
      } else if (standard === NFTStandard.ERC1155) {
        const contract = new ethers.Contract(contractAddress, this.ERC1155_ABI, this.provider);
        tokenURI = await contract.uri(tokenId);
        // Replace {id} placeholder with actual tokenId (hex, 64 chars)
        tokenURI = tokenURI.replace("{id}", BigInt(tokenId).toString(16).padStart(64, "0"));
      }

      // Resolve IPFS URL
      const resolvedURI = this.resolveIPFSUrl(tokenURI);

      // Fetch metadata JSON
      const response = await axios.get(resolvedURI, {
        timeout: 10000, // 10 second timeout
      });

      return response.data;
    } catch (_error) {
      console.error("Error fetching NFT metadata:", _error);
      return {};
    }
  }

  /**
   * Resolve IPFS URL to HTTP gateway
   */
  private resolveIPFSUrl(url: string | undefined): string {
    if (!url) return "";

    if (url.startsWith("ipfs://")) {
      return url.replace("ipfs://", "https://ipfs.io/ipfs/");
    }

    return url;
  }

  /**
   * Search and filter user NFTs
   */
  async searchUserNFTs(
    userId: string,
    filters: {
      query?: string;
      contractAddress?: string;
      standard?: NFTStandard;
      activeOnly?: boolean;
    }
  ): Promise<UserNFT[]> {
    let nfts = await this.loadUserNFTsFromFile(userId);

    if (filters.activeOnly !== false) {
      nfts = nfts.filter(nft => nft.isActive);
    }

    if (filters.query) {
      const query = filters.query.toLowerCase();
      nfts = nfts.filter(
        nft =>
          nft.name?.toLowerCase().includes(query) ||
          nft.description?.toLowerCase().includes(query) ||
          nft.collectionName?.toLowerCase().includes(query) ||
          nft.tokenId.toLowerCase().includes(query)
      );
    }

    if (filters.contractAddress) {
      nfts = nfts.filter(
        nft => nft.contractAddress.toLowerCase() === filters.contractAddress.toLowerCase()
      );
    }

    if (filters.standard) {
      nfts = nfts.filter(nft => nft.standard === filters.standard);
    }

    return nfts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get NFT statistics for a user
   */
  async getNFTStats(userId: string): Promise<{
    total: number;
    erc721: number;
    erc1155: number;
    collections: number;
  }> {
    const nfts = await this.getUserNFTs(userId);

    const uniqueCollections = new Set(nfts.map(nft => nft.contractAddress.toLowerCase()));

    return {
      total: nfts.length,
      erc721: nfts.filter(nft => nft.standard === NFTStandard.ERC721).length,
      erc1155: nfts.filter(nft => nft.standard === NFTStandard.ERC1155).length,
      collections: uniqueCollections.size,
    };
  }
}

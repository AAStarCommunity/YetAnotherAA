import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CommunityService } from "./community.service";
import type { Address } from "viem";

@ApiTags("community")
@Controller("community")
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ── Public Endpoints ─────────────────────────────────────────────────────────

  @Get("list")
  @ApiOperation({ summary: "Get all community admins with metadata and token info" })
  async getAllCommunities() {
    return this.communityService.getAllCommunities();
  }

  @Get("addresses")
  @ApiOperation({ summary: "Get contract addresses needed for frontend tx encoding" })
  getContractAddresses() {
    return this.communityService.getContractAddresses();
  }

  @Get("info")
  @ApiOperation({ summary: "Get community info for a given address" })
  @ApiQuery({ name: "address", required: true })
  async getCommunityInfo(@Query("address") address: string) {
    const [metadata, tokenAddress] = await Promise.all([
      this.communityService.getCommunityMetadata(address as Address),
      this.communityService.getDeployedTokenAddress(address as Address),
    ]);

    let tokenInfo = null;
    if (tokenAddress) {
      tokenInfo = await this.communityService.getTokenInfo(tokenAddress);
    }

    return { address, metadata, tokenAddress, tokenInfo };
  }

  @Get("token")
  @ApiOperation({ summary: "Get xPNTs token info for an address" })
  @ApiQuery({ name: "address", required: true })
  async getTokenInfo(@Query("address") address: string) {
    const tokenAddress = await this.communityService.getDeployedTokenAddress(address as Address);
    if (!tokenAddress) {
      return { address, tokenAddress: null, tokenInfo: null };
    }
    const tokenInfo = await this.communityService.getTokenInfo(tokenAddress);
    return { address, tokenAddress, tokenInfo };
  }

  // ── JWT-Protected Endpoints ──────────────────────────────────────────────────

  @Get("dashboard")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get full community dashboard for the authenticated user" })
  async getDashboard(@Request() req: any, @Query("address") address?: string) {
    const targetAddress = (address || req.user?.walletAddress) as Address | undefined;

    if (!targetAddress) {
      return {
        address: null,
        isAdmin: false,
        metadata: null,
        gtokenBalance: "0",
        tokenAddress: null,
        tokenInfo: null,
        xpntsBalance: null,
      };
    }

    return this.communityService.getCommunityDashboard(targetAddress);
  }

  @Get("gtoken-balance")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get GToken balance for an address" })
  @ApiQuery({ name: "address", required: false })
  async getGTokenBalance(@Request() req: any, @Query("address") address?: string) {
    const target = (address || req.user?.walletAddress) as Address | undefined;

    if (!target) {
      return { address: null, balance: "0" };
    }

    const balance = await this.communityService.getGTokenBalance(target);
    return { address: target, balance };
  }
}

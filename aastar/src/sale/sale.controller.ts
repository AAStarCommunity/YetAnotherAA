import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SaleService } from "./sale.service";
import type { Address } from "viem";

@ApiTags("sale")
@Controller("sale")
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  // ── Public Endpoints ─────────────────────────────────────────────────────────

  @Get("overview")
  @ApiOperation({ summary: "Get overview of both GToken and aPNTs sales" })
  async getOverview() {
    return this.saleService.getSaleOverview();
  }

  @Get("gtoken/status")
  @ApiOperation({ summary: "Get GToken sale contract status and price curve" })
  async getGTokenStatus() {
    return this.saleService.getGTokenSaleStatus();
  }

  @Get("apnts/status")
  @ApiOperation({ summary: "Get aPNTs sale contract status" })
  async getAPNTsStatus() {
    return this.saleService.getAPNTsSaleStatus();
  }

  @Get("apnts/quote")
  @ApiOperation({ summary: "Get aPNTs amount for a USD input" })
  @ApiQuery({ name: "usdAmount", required: true, description: "USD amount (e.g. 100 for $100)" })
  async getAPNTsQuote(@Query("usdAmount") usdAmount: string) {
    return this.saleService.getAPNTsSaleQuote(usdAmount);
  }

  @Get("gtoken/events")
  @ApiOperation({ summary: "Get GToken purchase events (last N blocks)" })
  async getGTokenEvents() {
    return this.saleService.getGTokenSaleEvents();
  }

  @Get("addresses")
  @ApiOperation({ summary: "Get sale contract addresses for frontend tx encoding" })
  getAddresses() {
    return this.saleService.getContractAddresses();
  }

  // ── JWT-Protected Endpoints ──────────────────────────────────────────────────

  @Get("gtoken/eligibility")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Check if authenticated user is eligible to buy GToken" })
  async checkGTokenEligibility(@Request() req: any, @Query("address") address?: string) {
    const target = (address || req.user?.walletAddress) as Address | undefined;
    if (!target)
      return {
        address: null,
        eligible: false,
        hasBought: false,
        reason: "No wallet address linked",
      };
    const hasBought = await this.saleService.checkGTokenHasBought(target);
    return {
      address: target,
      eligible: !hasBought,
      hasBought,
      reason: hasBought ? "Already purchased in this sale" : null,
    };
  }
}

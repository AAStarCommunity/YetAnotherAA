import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OperatorService } from "./operator.service";
import { isAddress } from "viem";
import type { Address } from "viem";

@ApiTags("operator")
@Controller("operator")
export class OperatorController {
  constructor(private readonly operatorService: OperatorService) {}

  // ── Public Endpoints ─────────────────────────────────────────────────────────

  @Get("addresses")
  @ApiOperation({ summary: "Get contract addresses for frontend tx encoding" })
  getContractAddresses() {
    return this.operatorService.getContractAddresses();
  }

  @Get("spo/list")
  @ApiOperation({ summary: "Get all SPO operators" })
  async getAllSPO() {
    return this.operatorService.getAllSPOOperators();
  }

  @Get("v4/list")
  @ApiOperation({ summary: "Get all V4 Paymaster operators" })
  async getAllV4() {
    return this.operatorService.getAllV4Operators();
  }

  @Get("status")
  @ApiOperation({ summary: "Get operator status for a given address" })
  @ApiQuery({ name: "address", required: false })
  async getStatus(@Query("address") address?: string) {
    // Missing / malformed address is a valid "not an operator" query, not a 500:
    // passing undefined to the contract's hasRole(user) reverts. Return an empty,
    // unregistered status instead.
    if (!address || !isAddress(address)) {
      return { address: address ?? null, registered: false, spoStatus: null, v4Status: null };
    }
    const [spoStatus, v4Status] = await Promise.all([
      this.operatorService.getSPOStatus(address as Address),
      this.operatorService.getV4PaymasterStatus(address as Address),
    ]);
    const registered = !!(spoStatus?.hasRole || v4Status?.hasRole);
    return { address, registered, spoStatus, v4Status };
  }

  // ── JWT-Protected Endpoints ──────────────────────────────────────────────────

  @Get("dashboard")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get full operator dashboard for the authenticated user" })
  async getDashboard(@Request() req: any, @Query("address") address?: string) {
    const targetAddress = (address || req.user?.walletAddress) as Address | undefined;

    if (!targetAddress) {
      return {
        address: null,
        isSPO: false,
        isV4Operator: false,
        gtokenBalance: "0",
        spoStatus: null,
        v4Status: { paymasterAddress: null, balance: "0", hasRole: false },
        registryAddress: "",
        superPaymasterAddress: "",
        paymasterFactoryAddress: "",
        stakingAddress: "",
      };
    }

    return this.operatorService.getOperatorDashboard(targetAddress);
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

    const balance = await this.operatorService.getGTokenBalance(target);
    return { address: target, balance };
  }
}

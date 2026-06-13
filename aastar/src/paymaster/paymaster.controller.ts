import { Controller, Get, Post, Body, UseGuards, Param, Delete, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PaymasterService } from "./paymaster.service";

@ApiTags("paymaster")
@Controller("paymaster")
export class PaymasterController {
  constructor(private readonly paymasterService: PaymasterService) {}

  @Get("available")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get available paymaster services" })
  @ApiResponse({
    status: 200,
    description: "List of available paymaster services",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", example: "pimlico-optimism" },
          address: { type: "string", example: "0x..." },
          configured: { type: "boolean", example: true },
        },
      },
    },
  })
  async getAvailablePaymasters(@Request() req) {
    const userId = req.user.sub;
    return this.paymasterService.getAvailablePaymasters(userId);
  }

  @Post("sponsor")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get paymaster sponsorship for a UserOperation" })
  @ApiResponse({
    status: 200,
    description: "Paymaster sponsorship data",
    schema: {
      type: "object",
      properties: {
        paymasterAndData: { type: "string", example: "0x..." },
        sponsored: { type: "boolean", example: true },
      },
    },
  })
  async sponsorUserOperation(
    @Request() req,
    @Body()
    body: {
      paymasterName: string;
      userOp: any;
      entryPoint?: string;
    }
  ) {
    const userId = req.user.sub;
    const entryPoint = body.entryPoint || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
    const paymasterAndData = await this.paymasterService.getPaymasterData(
      userId,
      body.paymasterName,
      body.userOp,
      entryPoint
    );

    return {
      paymasterAndData,
      sponsored: paymasterAndData !== "0x",
    };
  }

  @Post("add")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a custom paymaster" })
  @ApiResponse({
    status: 200,
    description: "Paymaster added successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        message: { type: "string", example: "Paymaster added successfully" },
      },
    },
  })
  async addCustomPaymaster(
    @Request() req,
    @Body()
    body: {
      name: string;
      address: string;
      type?: "pimlico" | "stackup" | "alchemy" | "custom";
      apiKey?: string;
      endpoint?: string;
    }
  ) {
    const userId = req.user.sub;
    await this.paymasterService.addCustomPaymaster(
      userId,
      body.name,
      body.address,
      body.type || "custom",
      body.apiKey,
      body.endpoint
    );

    return {
      success: true,
      message: "Paymaster added successfully",
    };
  }

  @Delete(":name")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove a custom paymaster" })
  @ApiResponse({
    status: 200,
    description: "Paymaster removed successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        message: { type: "string", example: "Paymaster removed successfully" },
      },
    },
  })
  async removeCustomPaymaster(@Request() req, @Param("name") name: string) {
    const userId = req.user.sub;
    const removed = await this.paymasterService.removeCustomPaymaster(userId, name);

    if (removed) {
      return {
        success: true,
        message: "Paymaster removed successfully",
      };
    } else {
      return {
        success: false,
        message: "Paymaster not found",
      };
    }
  }

  @Get("analyze/:txHash")
  @ApiOperation({ summary: "Analyze if a transaction used Paymaster" })
  @ApiResponse({
    status: 200,
    description: "Transaction analysis result",
    schema: {
      type: "object",
      properties: {
        txHash: { type: "string" },
        isERC4337: { type: "boolean" },
        usedPaymaster: { type: "boolean" },
        paymasterAddress: { type: "string", nullable: true },
        bundlerAddress: { type: "string" },
        userOpHash: { type: "string", nullable: true },
        gasUsed: { type: "string" },
        gasPaidBy: { type: "string" },
        details: { type: "object" },
      },
    },
  })
  async analyzeTransaction(@Param("txHash") txHash: string) {
    return this.paymasterService.analyzeTransaction(txHash);
  }
}

import { Controller, Post, Get, Body, Query, Param, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { TransferService } from "./transfer.service";
import { PrepareTransferDto } from "./dto/prepare-transfer.dto";
import { SubmitTransferDto } from "./dto/submit-transfer.dto";
import { EstimateGasDto } from "./dto/estimate-gas.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("transfer")
@Controller("transfer")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransferController {
  constructor(private transferService: TransferService) {}

  @Post("prepare")
  @ApiOperation({
    summary: "Phase 1: prepare a strict device-passkey transfer (build + commitment)",
  })
  async prepareTransfer(@Request() req, @Body() prepareTransferDto: PrepareTransferDto) {
    return this.transferService.prepareTransfer(req.user.sub, prepareTransferDto);
  }

  @Post("submit")
  @ApiOperation({ summary: "Phase 3: submit a prepared transfer with the ceremony assertion" })
  async submitTransfer(@Request() req, @Body() submitTransferDto: SubmitTransferDto) {
    return this.transferService.submitPreparedTransfer(req.user.sub, submitTransferDto);
  }

  @Post("estimate")
  @ApiOperation({ summary: "Estimate gas for transfer" })
  async estimateGas(@Request() req, @Body() estimateGasDto: EstimateGasDto) {
    return this.transferService.estimateGas(req.user.sub, estimateGasDto);
  }

  @Get("status/:id")
  @ApiOperation({ summary: "Get transfer status by ID" })
  @ApiResponse({ status: 200, description: "Transfer status found" })
  @ApiResponse({ status: 404, description: "Transfer not found or belongs to different user" })
  async getTransferStatus(@Request() req, @Param("id") id: string) {
    return this.transferService.getTransferStatus(req.user.sub, id);
  }

  @Get("history")
  @ApiOperation({ summary: "Get transfer history" })
  @ApiResponse({
    status: 200,
    description: "Transfer history retrieved (may be empty array if no transfers)",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getTransferHistory(
    @Request() req,
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "10"
  ) {
    return this.transferService.getTransferHistory(req.user.sub, parseInt(page), parseInt(limit));
  }
}

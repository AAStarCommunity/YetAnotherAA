import { Controller, Post, Get, Body, UseGuards, Request, HttpStatus, Res } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { AccountService } from "./account.service";
import { CreateAccountDto } from "./dto/create-account.dto";
import { RotateSignerDto } from "./dto/rotate-signer.dto";
import { GuardianSetupPrepareDto, CreateWithGuardiansDto } from "./dto/guardian-setup.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("account")
@Controller("account")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountController {
  constructor(private accountService: AccountService) {}

  @Post("create")
  @ApiOperation({ summary: "Create ERC-4337 account for user" })
  async createAccount(@Request() req, @Body() createAccountDto: CreateAccountDto) {
    return this.accountService.createAccount(req.user.sub, createAccountDto);
  }

  @Get()
  @ApiOperation({ summary: "Get user account information" })
  @ApiResponse({ status: 200, description: "Account found" })
  @ApiResponse({ status: 204, description: "No account exists for user" })
  async getAccount(@Request() req, @Res() res) {
    console.log("AccountController.getAccount called");
    console.log("User from JWT:", req.user);

    const accountData = await this.accountService.getAccount(req.user.sub);

    if (accountData === null) {
      console.log("No account found - returning 204 No Content");
      return res.status(HttpStatus.NO_CONTENT).send();
    }

    console.log("Account data retrieved successfully");
    return res.status(HttpStatus.OK).json(accountData);
  }

  @Get("address")
  @ApiOperation({ summary: "Get account address" })
  async getAddress(@Request() req) {
    const address = await this.accountService.getAccountAddress(req.user.sub);
    return { address };
  }

  @Get("balance")
  @ApiOperation({ summary: "Get account balance" })
  async getBalance(@Request() req) {
    return this.accountService.getAccountBalance(req.user.sub);
  }

  @Get("nonce")
  @ApiOperation({ summary: "Get account nonce" })
  async getNonce(@Request() req) {
    return this.accountService.getAccountNonce(req.user.sub);
  }

  @Post("guardian-setup/prepare")
  @ApiOperation({
    summary: "Prepare guardian acceptance hash and QR payload for account creation",
    description:
      "Generates an acceptance hash and QR payload that guardian devices must scan and sign. " +
      "Returns acceptanceHash and qrPayload. Encode qrPayload as a QR code for guardian scanning.",
  })
  async prepareGuardianSetup(@Request() req, @Body() dto: GuardianSetupPrepareDto) {
    return this.accountService.prepareGuardianSetup(req.user.sub, dto);
  }

  @Post("create-with-guardians")
  @ApiOperation({
    summary: "Create account with guardian signatures collected via QR scan",
    description:
      "Creates an AirAccount with 3 on-chain guardians: guardian1 + guardian2 (user devices) " +
      "and the team Safe as defaultCommunityGuardian. Both guardian sigs must be obtained first " +
      "via guardian-setup/prepare + QR scan.",
  })
  async createWithGuardians(@Request() req, @Body() dto: CreateWithGuardiansDto) {
    return this.accountService.createWithGuardians(req.user.sub, dto);
  }

  @Post("rotate-signer")
  @ApiOperation({
    summary: "Update the off-chain signer address (Phase 1: Owner Rotation)",
    description:
      "Updates the signerAddress record in the backend. " +
      "To fully rotate on-chain, also submit a UserOp calling updateSigner() on the account contract.",
  })
  async rotateSigner(@Request() req, @Body() dto: RotateSignerDto) {
    return this.accountService.rotateSigner(req.user.sub, dto.newSignerAddress);
  }

  // fund and sponsor endpoints removed - not needed with Paymaster
  // All transactions are sponsored by Paymaster
}

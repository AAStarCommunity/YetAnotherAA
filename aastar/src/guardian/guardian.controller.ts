import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { GuardianService } from "./guardian.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DatabaseService } from "../database/database.service";
import {
  AddGuardianDto,
  RemoveGuardianDto,
  InitiateRecoveryDto,
  SupportRecoveryDto,
  ExecuteRecoveryDto,
  CancelRecoveryDto,
  PrepareP256RecoveryDto,
  SubmitP256RecoveryDto,
} from "./dto/guardian.dto";

@ApiTags("guardian")
@Controller("guardian")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GuardianController {
  constructor(
    private guardianService: GuardianService,
    private databaseService: DatabaseService
  ) {}

  private async getAccountAddress(userId: string): Promise<string> {
    const account = await this.databaseService.findAccountByUserId(userId);
    if (!account) {
      throw new NotFoundException("No account found for this user. Create an account first.");
    }
    return account.address;
  }

  private async getWalletAddress(userId: string): Promise<string> {
    const user = await this.databaseService.findUserById(userId);
    if (!user || !user.walletAddress) {
      throw new NotFoundException("User wallet not found");
    }
    return user.walletAddress;
  }

  @Get(":accountAddress")
  @ApiOperation({ summary: "List active guardians for an account" })
  @ApiParam({ name: "accountAddress", description: "Smart account address" })
  async getGuardians(@Param("accountAddress") accountAddress: string) {
    return this.guardianService.getGuardians(accountAddress);
  }

  @Post("add")
  @ApiOperation({ summary: "Add a guardian to the caller's account" })
  async addGuardian(@Request() req, @Body() dto: AddGuardianDto) {
    const accountAddress = await this.getAccountAddress(req.user.sub);
    return this.guardianService.addGuardian(accountAddress, dto);
  }

  @Delete("remove")
  @ApiOperation({ summary: "Remove a guardian from the caller's account" })
  async removeGuardian(@Request() req, @Body() dto: RemoveGuardianDto) {
    const accountAddress = await this.getAccountAddress(req.user.sub);
    return this.guardianService.removeGuardian(accountAddress, dto);
  }

  @Post("recovery/initiate")
  @ApiOperation({ summary: "Initiate account recovery (caller must be a guardian)" })
  async initiateRecovery(@Request() req, @Body() dto: InitiateRecoveryDto) {
    const callerAddress = await this.getWalletAddress(req.user.sub);
    return this.guardianService.initiateRecovery(callerAddress, dto);
  }

  @Post("recovery/support")
  @ApiOperation({ summary: "Support a pending recovery request (caller must be a guardian)" })
  async supportRecovery(@Request() req, @Body() dto: SupportRecoveryDto) {
    const callerAddress = await this.getWalletAddress(req.user.sub);
    return this.guardianService.supportRecovery(callerAddress, dto);
  }

  @Post("recovery/execute")
  @ApiOperation({ summary: "Execute recovery after time lock expires" })
  async executeRecovery(@Body() dto: ExecuteRecoveryDto) {
    return this.guardianService.executeRecovery(dto.accountAddress);
  }

  @Post("recovery/cancel")
  @ApiOperation({
    summary: "Cancel a pending recovery (caller must be guardian or account signer)",
  })
  async cancelRecovery(@Request() req, @Body() dto: CancelRecoveryDto) {
    const callerAddress = await this.getWalletAddress(req.user.sub);
    return this.guardianService.cancelRecovery(callerAddress, dto.accountAddress);
  }

  @Get("recovery/:accountAddress")
  @ApiOperation({ summary: "Get pending recovery request for an account" })
  @ApiParam({ name: "accountAddress", description: "Smart account address" })
  async getPendingRecovery(@Param("accountAddress") accountAddress: string) {
    return this.guardianService.getPendingRecovery(accountAddress);
  }

  @Post("recovery/p256/prepare")
  @ApiOperation({
    summary: "Build the challenge a passkey guardian must sign to propose recovery",
    description:
      "Reads the on-chain recovery nonce + P-256 guardian slot and returns the 32-byte challenge " +
      "to pass to navigator.credentials.get(). Step 1 of passkey-guardian recovery.",
  })
  async prepareP256Recovery(@Body() dto: PrepareP256RecoveryDto) {
    return this.guardianService.prepareP256Recovery(dto);
  }

  @Post("recovery/p256/submit")
  @ApiOperation({
    summary: "Relay proposeRecoveryWithSig with a passkey guardian's WebAuthn assertion",
    description:
      "Encodes the WebAuthn assertion and relays proposeRecoveryWithSig on-chain (backend pays gas; " +
      "the passkey signature is the authorization, so any relayer may submit). Step 2 of recovery.",
  })
  async submitP256Recovery(@Body() dto: SubmitP256RecoveryDto) {
    return this.guardianService.submitP256Recovery(dto);
  }
}

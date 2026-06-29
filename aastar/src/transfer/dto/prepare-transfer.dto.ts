import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEthereumAddress, IsBoolean } from "class-validator";

/**
 * Phase-1 of the strict device-passkey transfer. The backend builds the UserOp,
 * derives the tier-aware payload, gets a KMS challenge and the WYSIWYS commitment
 * — all inside the SDK's prepareTransfer. No passkey assertion yet.
 */
export class PrepareTransferDto {
  @ApiProperty({ description: "Recipient address", example: "0x..." })
  @IsEthereumAddress()
  to: string;

  @ApiProperty({ description: "Amount to transfer", example: "0.001" })
  @IsString()
  amount: string;

  @ApiProperty({
    description: "Token contract address (optional; ETH transfer if omitted)",
    required: false,
  })
  @IsOptional()
  @IsEthereumAddress()
  tokenAddress?: string;

  @ApiProperty({ description: "Call data (optional)", required: false })
  @IsOptional()
  @IsString()
  data?: string;

  @ApiProperty({
    description: "Use Paymaster for gas sponsorship",
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  usePaymaster?: boolean;

  @ApiProperty({
    description: "Paymaster address (optional, uses default if not provided)",
    required: false,
  })
  @IsOptional()
  @IsEthereumAddress()
  paymasterAddress?: string;

  @ApiProperty({ description: "Additional Paymaster data (optional)", required: false })
  @IsOptional()
  @IsString()
  paymasterData?: string;

  @ApiProperty({
    description:
      "Use the on-chain WebAuthn-passkey cumulative path (algId 0x09/0x0a) for Tier-2/3. When true, " +
      "the SDK runs NO KMS owner ceremony — prepare returns no challengeId/publicKeyOptions and the " +
      "frontend runs ONE navigator.credentials.get() with challenge = the returned userOpHash, then " +
      "submits the assertion as deviceWebAuthn. Tier-2/3 ONLY (the SDK rejects it for Tier-1). The " +
      "frontend sets this from its resolveTransfer tier.",
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  useWebAuthnPasskey?: boolean;
}

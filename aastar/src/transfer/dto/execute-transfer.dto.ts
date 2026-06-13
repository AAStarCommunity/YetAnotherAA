import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsEthereumAddress,
  IsBoolean,
  IsObject,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PasskeyAssertionDto {
  @ApiProperty({ description: "Authenticator data (hex)", example: "0x..." })
  @IsString()
  AuthenticatorData: string;

  @ApiProperty({ description: "SHA-256 hash of clientDataJSON (hex)", example: "0x..." })
  @IsString()
  ClientDataHash: string;

  @ApiProperty({ description: "P-256 signature (hex)", example: "0x..." })
  @IsString()
  Signature: string;
}

export class ExecuteTransferDto {
  @ApiProperty({ description: "Recipient address", example: "0x..." })
  @IsEthereumAddress()
  to: string;

  @ApiProperty({ description: "Amount to transfer", example: "0.001" })
  @IsString()
  amount: string;

  @ApiProperty({
    description: "Token contract address (optional, if not provided, transfers ETH)",
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
      "Legacy Passkey assertion (extracted from WebAuthn authentication response). " +
      "Reusable for BLS dual-signing.",
    required: true,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => PasskeyAssertionDto)
  passkeyAssertion: PasskeyAssertionDto;

  @ApiProperty({
    description:
      "P-256 passkey signature (64 bytes hex, r||s). " +
      "Required for AirAccount Tier 2/3 tiered signing. " +
      "Extracted from WebAuthn assertion response.signature.",
    required: false,
  })
  @IsOptional()
  @IsString()
  p256Signature?: string;
}

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
}

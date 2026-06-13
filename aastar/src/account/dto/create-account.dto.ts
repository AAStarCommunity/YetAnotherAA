import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsNumber, IsBoolean, IsString, IsEnum } from "class-validator";

export enum EntryPointVersionDto {
  V0_6 = "0.6",
  V0_7 = "0.7",
  V0_8 = "0.8",
}

export class CreateAccountDto {
  @ApiProperty({ description: "Salt for deterministic address generation", required: false })
  @IsOptional()
  @IsNumber()
  salt?: number;

  @ApiProperty({ description: "Deploy account on-chain immediately", default: false })
  @IsOptional()
  @IsBoolean()
  deploy?: boolean;

  @ApiProperty({ description: "Amount of ETH to fund the account with", required: false })
  @IsOptional()
  @IsString()
  fundAmount?: string;

  @ApiProperty({
    description: "EntryPoint version to use",
    enum: EntryPointVersionDto,
    default: EntryPointVersionDto.V0_6,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntryPointVersionDto)
  entryPointVersion?: EntryPointVersionDto;

  @ApiProperty({
    description:
      "Daily transfer limit in ETH. " +
      "When set (> 0), the account is created with on-chain guard enforcement. " +
      "Tier 3 transfers above this limit require guardian ECDSA approval. " +
      "Default: 0 (no limit / no guard).",
    example: "1.0",
    required: false,
  })
  @IsOptional()
  @IsString()
  dailyLimit?: string;
}

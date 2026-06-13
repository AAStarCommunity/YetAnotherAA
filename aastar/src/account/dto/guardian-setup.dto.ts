import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsNumber, IsString, IsEnum, IsEthereumAddress } from "class-validator";
import { EntryPointVersionDto } from "./create-account.dto";

export class GuardianSetupPrepareDto {
  @ApiProperty({
    description: "EntryPoint version to use",
    enum: EntryPointVersionDto,
    default: EntryPointVersionDto.V0_7,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntryPointVersionDto)
  entryPointVersion?: EntryPointVersionDto;

  @ApiProperty({ description: "Salt for deterministic address generation", required: false })
  @IsOptional()
  @IsNumber()
  salt?: number;
}

export class CreateWithGuardiansDto {
  @ApiProperty({ description: "Guardian 1 Ethereum address" })
  @IsEthereumAddress()
  guardian1: string;

  @ApiProperty({ description: "Guardian 1 acceptance signature (hex)" })
  @IsString()
  guardian1Sig: string;

  @ApiProperty({ description: "Guardian 2 Ethereum address" })
  @IsEthereumAddress()
  guardian2: string;

  @ApiProperty({ description: "Guardian 2 acceptance signature (hex)" })
  @IsString()
  guardian2Sig: string;

  @ApiProperty({
    description: "Daily spending limit in wei (string to avoid bigint precision loss)",
  })
  @IsString()
  dailyLimit: string;

  @ApiProperty({ description: "Salt used during prepare step", required: false })
  @IsOptional()
  @IsNumber()
  salt?: number;

  @ApiProperty({
    description: "EntryPoint version to use",
    enum: EntryPointVersionDto,
    default: EntryPointVersionDto.V0_7,
    required: false,
  })
  @IsOptional()
  @IsEnum(EntryPointVersionDto)
  entryPointVersion?: EntryPointVersionDto;
}

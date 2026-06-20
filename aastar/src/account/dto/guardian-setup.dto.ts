import { ApiProperty } from "@nestjs/swagger";
import {
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  IsEthereumAddress,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import { EntryPointVersionDto } from "./create-account.dto";

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

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

  @ApiProperty({
    description:
      "Daily spending limit (string). Bound into the guardian acceptance hash since SDK 0.20.x, " +
      "so it MUST match the value submitted in the create step. Default: 0 (no limit).",
    required: false,
  })
  @IsOptional()
  @IsString()
  dailyLimit?: string;
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

/**
 * A P-256 (WebAuthn passkey) guardian, identified by its secp256r1 public key.
 * Not an address — the contract stores the sentinel P256_GUARDIAN_SENTINEL in the
 * guardian-address slot and the (x, y) pair in parallel storage.
 */
export class P256GuardianKeyDto {
  @ApiProperty({ description: "secp256r1 public key X coordinate (0x-prefixed 32-byte hex)" })
  @Matches(HEX32, { message: "x must be a 0x-prefixed 32-byte hex string" })
  x: string;

  @ApiProperty({ description: "secp256r1 public key Y coordinate (0x-prefixed 32-byte hex)" })
  @Matches(HEX32, { message: "y must be a 0x-prefixed 32-byte hex string" })
  y: string;
}

/**
 * Create an account with P-256 passkey guardian(s). Unlike CreateWithGuardiansDto
 * (ECDSA guardians that scan a QR and sign an acceptance hash), P-256 guardians are
 * an owner-bootstrap: the owner registers the pubkeys at deploy time with NO guardian
 * signature, so there is no prepare/QR step. The contract's config-hash-in-salt binding
 * stands in for acceptance sigs. Requires @aastar/sdk >= 0.23.0.
 */
export class CreateWithP256GuardiansDto {
  @ApiProperty({
    description:
      "P-256 passkey guardian public keys installed at deploy time (1–3). Owner-bootstrap — no acceptance signatures.",
    type: [P256GuardianKeyDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => P256GuardianKeyDto)
  p256Guardians: P256GuardianKeyDto[];

  @ApiProperty({
    description:
      "Daily transfer limit in ETH. MUST be > 0 — a guardian set enables the on-chain guard.",
    example: "1.0",
  })
  @IsString()
  dailyLimit: string;

  @ApiProperty({ description: "Salt for deterministic address generation", required: false })
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

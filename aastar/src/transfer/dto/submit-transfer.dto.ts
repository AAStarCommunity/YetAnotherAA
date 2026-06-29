import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsObject, IsOptional, Matches } from "class-validator";

/**
 * Phase-3 of the strict device-passkey transfer. Carries the opaque prepared
 * handle plus the browser ceremony result. The credential signed the commitment
 * the SDK bound in prepareTransfer, so the KMS accepts it under strict.
 */
export class SubmitTransferDto {
  @ApiProperty({ description: "Opaque handle returned by /transfer/prepare" })
  @IsString()
  transferId: string;

  @ApiProperty({ description: "KMS BeginAuthentication ChallengeId returned by /transfer/prepare" })
  @IsString()
  challengeId: string;

  @ApiProperty({
    description:
      "WebAuthn authentication credential from the browser ceremony " +
      "(navigator.credentials.get / startAuthentication over publicKeyOptions).",
  })
  @IsObject()
  credential: unknown;

  @ApiProperty({
    required: false,
    description:
      "Guardian co-signature (hex) over the prepared userOpHash — REQUIRED for a Tier-3 " +
      "transfer (prepare returns tier:3 / requiredSigs.guardian>0). Collected client-side from " +
      "the user's self-hosted guardian; the backend wraps it as the SDK GuardianSigner. Omit for " +
      "Tier 1/2.",
  })
  @IsOptional()
  @IsString()
  @Matches(/^0x[0-9a-fA-F]+$/, {
    message: "guardianSignature must be a 0x-prefixed hex string",
  })
  guardianSignature?: string;
}

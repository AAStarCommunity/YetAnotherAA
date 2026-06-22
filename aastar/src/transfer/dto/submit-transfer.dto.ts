import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsObject } from "class-validator";

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
}

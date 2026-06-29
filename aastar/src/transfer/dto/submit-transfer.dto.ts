import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsObject, IsOptional, Matches } from "class-validator";

/**
 * Device WebAuthn assertion fields for the Tier-2/3 WebAuthn cumulative path (algId
 * 0x09/0x0a, #234). These are the three `navigator.credentials.get()` response fields
 * the browser produced with `challenge = userOpHash`, normalised by the frontend into
 * the encodings the SDK's `packWebAuthnBlob` expects: `authenticatorData` and
 * `signature` as 0x-hex, `clientDataJSON` as the RAW JSON text (must start with
 * `{"type":"webauthn.get","challenge":"…`). The SDK derives the on-chain passkey
 * factor + fetches the DVT BLS aggregate + packs the composite internally.
 */
export class DeviceWebAuthnDto {
  @ApiProperty({ description: "authenticatorData as 0x-prefixed hex" })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]*$/, { message: "authenticatorData must be 0x-prefixed hex" })
  authenticatorData: string;

  @ApiProperty({ description: "Raw clientDataJSON text (UTF-8, NOT base64url)" })
  @IsString()
  clientDataJSON: string;

  @ApiProperty({ description: "DER ECDSA signature as 0x-prefixed hex" })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]*$/, { message: "signature must be 0x-prefixed hex" })
  signature: string;
}

/**
 * Phase-3 of the strict device-passkey transfer. Carries the opaque prepared
 * handle plus the browser ceremony result.
 *
 * Two mutually-exclusive completion paths, routed by tier (the SDK decides):
 *  - Tier-1 (KMS owner ceremony): `challengeId` + `credential` — the credential signed
 *    the WYSIWYS commitment the SDK bound in prepareTransfer.
 *  - Tier-2/3 (WebAuthn passkey, #234): `deviceWebAuthn` — the assertion whose challenge
 *    is the prepared userOpHash. The SDK packs the 0x09/0x0a composite + fetches DVT BLS.
 */
export class SubmitTransferDto {
  @ApiProperty({ description: "Opaque handle returned by /transfer/prepare" })
  @IsString()
  transferId: string;

  @ApiProperty({
    required: false,
    description:
      "KMS BeginAuthentication ChallengeId returned by /transfer/prepare. Required for the " +
      "Tier-1 KMS owner-ceremony path; omitted on the Tier-2/3 WebAuthn passkey path.",
  })
  @IsOptional()
  @IsString()
  challengeId?: string;

  @ApiProperty({
    required: false,
    description:
      "WebAuthn authentication credential from the browser ceremony " +
      "(navigator.credentials.get / startAuthentication over publicKeyOptions). " +
      "Required for the Tier-1 KMS owner-ceremony path; omitted on the WebAuthn passkey path.",
  })
  @IsOptional()
  @IsObject()
  credential?: unknown;

  @ApiProperty({
    required: false,
    type: DeviceWebAuthnDto,
    description:
      "Device WebAuthn assertion for the Tier-2/3 WebAuthn cumulative path (challenge = userOpHash). " +
      "Present iff prepare was called with useWebAuthnPasskey:true (tier >= 2).",
  })
  @IsOptional()
  @IsObject()
  deviceWebAuthn?: DeviceWebAuthnDto;

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

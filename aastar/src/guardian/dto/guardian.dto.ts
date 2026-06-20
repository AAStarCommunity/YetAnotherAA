import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsNotEmpty, Matches } from "class-validator";

const HEX = /^0x[0-9a-fA-F]+$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export class AddGuardianDto {
  @ApiProperty({ description: "Ethereum address of the guardian to add" })
  @IsEthereumAddress()
  @IsNotEmpty()
  guardianAddress: string;
}

export class RemoveGuardianDto {
  @ApiProperty({ description: "Ethereum address of the guardian to remove" })
  @IsEthereumAddress()
  @IsNotEmpty()
  guardianAddress: string;
}

export class InitiateRecoveryDto {
  @ApiProperty({ description: "Account address to recover" })
  @IsEthereumAddress()
  @IsNotEmpty()
  accountAddress: string;

  @ApiProperty({ description: "New signer address to transfer control to" })
  @IsEthereumAddress()
  @IsNotEmpty()
  newSignerAddress: string;
}

export class SupportRecoveryDto {
  @ApiProperty({ description: "Account address whose recovery to support" })
  @IsEthereumAddress()
  @IsNotEmpty()
  accountAddress: string;
}

export class ExecuteRecoveryDto {
  @ApiProperty({ description: "Account address to execute recovery for" })
  @IsEthereumAddress()
  @IsNotEmpty()
  accountAddress: string;
}

export class CancelRecoveryDto {
  @ApiProperty({ description: "Account address whose recovery to cancel" })
  @IsEthereumAddress()
  @IsNotEmpty()
  accountAddress: string;
}

/**
 * Step 1 of passkey-guardian recovery: ask the backend for the 32-byte challenge
 * the guardian's passkey must sign (navigator.credentials.get). The backend reads
 * the on-chain recovery nonce and builds buildProposeRecoveryChallenge.
 */
export class PrepareP256RecoveryDto {
  @ApiProperty({ description: "Account (AirAccount) address to recover" })
  @IsEthereumAddress()
  @IsNotEmpty()
  accountAddress: string;

  @ApiProperty({ description: "New owner/signer address to transfer control to" })
  @IsEthereumAddress()
  @IsNotEmpty()
  newOwner: string;
}

/**
 * Step 2 of passkey-guardian recovery: submit the WebAuthn assertion produced by
 * the guardian's passkey over the challenge from step 1. The backend encodes it
 * (encodeWebAuthnAssertion) and relays proposeRecoveryWithSig on-chain (the contract
 * accepts ANY relayer — the passkey signature is the proof), paying gas itself.
 */
export class SubmitP256RecoveryDto {
  @ApiProperty({ description: "Account (AirAccount) address to recover" })
  @IsEthereumAddress()
  @IsNotEmpty()
  accountAddress: string;

  @ApiProperty({ description: "New owner/signer address (must match the prepare step)" })
  @IsEthereumAddress()
  @IsNotEmpty()
  newOwner: string;

  @ApiProperty({ description: "WebAuthn authenticatorData (0x hex)" })
  @Matches(HEX, { message: "authenticatorData must be 0x-prefixed hex" })
  authenticatorData: string;

  @ApiProperty({ description: "Full WebAuthn clientDataJSON the authenticator signed (0x hex)" })
  @Matches(HEX, { message: "clientDataJSON must be 0x-prefixed hex" })
  clientDataJSON: string;

  @ApiProperty({ description: "ES256 signature r (0x 32-byte hex)" })
  @Matches(HEX32, { message: "r must be a 0x-prefixed 32-byte hex string" })
  r: string;

  @ApiProperty({ description: "ES256 signature s (0x 32-byte hex)" })
  @Matches(HEX32, { message: "s must be a 0x-prefixed 32-byte hex string" })
  s: string;
}

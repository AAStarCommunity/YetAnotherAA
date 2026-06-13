import { ERC4337Utils, PackedUserOperation } from "@aastar/airaccount";

// Export type from SDK
export { PackedUserOperation };

// Helper functions (proxies to SDK)
export function packAccountGasLimits(
  verificationGasLimit: bigint | string,
  callGasLimit: bigint | string
): string {
  return ERC4337Utils.packAccountGasLimits(verificationGasLimit, callGasLimit);
}

export function unpackAccountGasLimits(accountGasLimits: string): {
  verificationGasLimit: bigint;
  callGasLimit: bigint;
} {
  return ERC4337Utils.unpackAccountGasLimits(accountGasLimits);
}

export function packGasFees(
  maxPriorityFeePerGas: bigint | string,
  maxFeePerGas: bigint | string
): string {
  return ERC4337Utils.packGasFees(maxPriorityFeePerGas, maxFeePerGas);
}

export function unpackGasFees(gasFees: string): {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
} {
  return ERC4337Utils.unpackGasFees(gasFees);
}

export function packUserOperation(userOp: any): PackedUserOperation {
  return ERC4337Utils.packUserOperation(userOp);
}

export function unpackUserOperation(packedOp: PackedUserOperation): any {
  return ERC4337Utils.unpackUserOperation(packedOp);
}

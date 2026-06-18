import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AirAccountServerClient as YAAAServerClient } from "@aastar/sdk/kms";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { EntryPointVersion } from "../common/constants/entrypoint.constants";

@Injectable()
export class EthereumService {
  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private configService: ConfigService
  ) {}

  getProvider() {
    return this.client.ethereum.getProvider();
  }

  async getBalance(address: string): Promise<string> {
    return this.client.ethereum.getBalance(address);
  }

  async getNonce(
    accountAddress: string,
    key: number = 0,
    version: EntryPointVersion = EntryPointVersion.V0_6
  ): Promise<bigint> {
    return this.client.ethereum.getNonce(accountAddress, key, version);
  }

  async getUserOpHash(
    userOp: any,
    version: EntryPointVersion = EntryPointVersion.V0_6
  ): Promise<string> {
    return this.client.ethereum.getUserOpHash(userOp, version);
  }

  async estimateUserOperationGas(
    userOp: any,
    version: EntryPointVersion = EntryPointVersion.V0_6
  ): Promise<any> {
    return this.client.ethereum.estimateUserOperationGas(userOp, version);
  }

  async sendUserOperation(
    userOp: any,
    version: EntryPointVersion = EntryPointVersion.V0_6
  ): Promise<string> {
    return this.client.ethereum.sendUserOperation(userOp, version);
  }

  async getUserOperationReceipt(userOpHash: string): Promise<any> {
    return this.client.ethereum.getUserOperationReceipt(userOpHash);
  }

  async waitForUserOp(userOpHash: string, maxAttempts: number = 60): Promise<string> {
    return this.client.ethereum.waitForUserOp(userOpHash, maxAttempts);
  }

  async getUserOperationGasPrice(): Promise<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }> {
    return this.client.ethereum.getUserOperationGasPrice();
  }

  // Backend-specific: SDK doesn't include this
  async detectAccountVersion(accountAddress: string): Promise<EntryPointVersion> {
    try {
      const provider = this.getProvider();
      // viem PublicClient.getCode takes { address } (not a bare string) and
      // returns Hex | undefined.
      const code = await provider.getCode({ address: accountAddress as `0x${string}` });
      if (code && code !== "0x") {
        return EntryPointVersion.V0_6;
      }
    } catch {
      // Ignore errors
    }
    return EntryPointVersion.V0_6;
  }
}

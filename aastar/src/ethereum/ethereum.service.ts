import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { YAAAServerClient } from "@aastar/airaccount/server";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { EntryPointVersion } from "../common/constants/entrypoint.constants";

@Injectable()
export class EthereumService {
  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private configService: ConfigService
  ) {}

  getProvider(): ethers.JsonRpcProvider {
    return this.client.ethereum.getProvider();
  }

  getBundlerProvider(): ethers.JsonRpcProvider {
    return this.client.ethereum.getBundlerProvider();
  }

  getFactoryContract(version: EntryPointVersion = EntryPointVersion.V0_6): ethers.Contract {
    return this.client.ethereum.getFactoryContract(version);
  }

  getEntryPointContract(version: EntryPointVersion = EntryPointVersion.V0_6): ethers.Contract {
    return this.client.ethereum.getEntryPointContract(version);
  }

  getValidatorContract(version: EntryPointVersion = EntryPointVersion.V0_6): ethers.Contract {
    return this.client.ethereum.getValidatorContract(version);
  }

  getAccountContract(address: string): ethers.Contract {
    return this.client.ethereum.getAccountContract(address);
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
      const code = await provider.getCode(accountAddress);
      if (code && code !== "0x") {
        return EntryPointVersion.V0_6;
      }
    } catch {
      // Ignore errors
    }
    return EntryPointVersion.V0_6;
  }
}

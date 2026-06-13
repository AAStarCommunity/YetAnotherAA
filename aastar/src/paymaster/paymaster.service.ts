import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { YAAAServerClient } from "@aastar/airaccount/server";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";

@Injectable()
export class PaymasterService {
  private provider: ethers.JsonRpcProvider;

  constructor(
    @Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient,
    private configService: ConfigService
  ) {
    this.provider = new ethers.JsonRpcProvider(
      this.configService.get<string>("ethRpcUrl") ||
        "https://optimism-mainnet.infura.io/v3/YOUR_PROJECT_ID"
    );
  }

  async getAvailablePaymasters(
    userId: string
  ): Promise<{ name: string; address: string; configured: boolean }[]> {
    return this.client.paymaster.getAvailablePaymasters(userId);
  }

  async addCustomPaymaster(
    userId: string,
    name: string,
    address: string,
    type: "pimlico" | "stackup" | "alchemy" | "custom" = "custom",
    apiKey?: string,
    endpoint?: string
  ): Promise<void> {
    return this.client.paymaster.addCustomPaymaster(userId, name, address, type, apiKey, endpoint);
  }

  async removeCustomPaymaster(userId: string, name: string): Promise<boolean> {
    return this.client.paymaster.removeCustomPaymaster(userId, name);
  }

  async getPaymasterData(
    userId: string,
    paymasterName: string,
    userOp: any,
    entryPoint: string,
    customAddress?: string
  ): Promise<string> {
    return this.client.paymaster.getPaymasterData(
      userId,
      paymasterName,
      userOp,
      entryPoint,
      customAddress
    );
  }

  // Backend-specific: SDK doesn't include this
  async validatePaymasterSignature(
    paymasterAndData: string,
    _userOpHash: string
  ): Promise<boolean> {
    if (!paymasterAndData || paymasterAndData === "0x") {
      return false;
    }

    // Placeholder - actual implementation depends on paymaster
    return true;
  }

  // Backend-specific: SDK doesn't include this
  async analyzeTransaction(txHash: string): Promise<any> {
    try {
      const [tx, receipt] = await Promise.all([
        this.provider.getTransaction(txHash),
        this.provider.getTransactionReceipt(txHash),
      ]);

      if (!tx || !receipt) {
        throw new Error("Transaction not found");
      }

      const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789".toLowerCase();
      const isERC4337 = tx.to?.toLowerCase() === entryPointAddress;

      if (!isERC4337) {
        return {
          txHash,
          isERC4337: false,
          usedPaymaster: false,
          message: "Not an ERC-4337 transaction",
        };
      }

      let usedPaymaster = false;
      let paymasterAddress: string | null = null;
      let userOpDetails: any = {};

      try {
        const handleOpsABI = [
          "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address payable beneficiary)",
        ];

        const iface = new ethers.Interface(handleOpsABI);
        const decoded = iface.parseTransaction({ data: tx.data });

        if (decoded && decoded.args[0] && decoded.args[0].length > 0) {
          const userOp = decoded.args[0][0];
          const paymasterAndData = userOp.paymasterAndData;
          usedPaymaster =
            paymasterAndData && paymasterAndData !== "0x" && paymasterAndData.length > 2;

          if (usedPaymaster && paymasterAndData.length >= 42) {
            paymasterAddress = "0x" + paymasterAndData.slice(2, 42);
          }

          userOpDetails = {
            sender: userOp.sender,
            nonce: userOp.nonce.toString(),
            hasInitCode: userOp.initCode && userOp.initCode !== "0x",
            callGasLimit: userOp.callGasLimit.toString(),
            verificationGasLimit: userOp.verificationGasLimit.toString(),
            preVerificationGas: userOp.preVerificationGas.toString(),
            maxFeePerGas: ethers.formatUnits(userOp.maxFeePerGas, "gwei") + " gwei",
            maxPriorityFeePerGas: ethers.formatUnits(userOp.maxPriorityFeePerGas, "gwei") + " gwei",
            paymasterAndDataLength: paymasterAndData.length,
          };
        }
      } catch {
        // Failed to decode UserOperation
      }

      const gasPaidBy = usedPaymaster
        ? `Paymaster (${paymasterAddress || "Unknown"})`
        : "User's Smart Account";

      const knownBundlers: { [key: string]: string } = {
        "0x3cfb5c0f608819d4e27d97e68b5c7051716b645b": "Pimlico Bundler",
        "0xc03aac639bb21233e0139381970328db8bceeb67": "Alchemy Bundler",
        "0x0a9a234244b89a9352286b17e5ff19a23c8a3b04": "StackUp Bundler",
      };

      const bundlerName = knownBundlers[tx.from.toLowerCase()] || "Unknown Bundler";

      return {
        txHash,
        isERC4337: true,
        usedPaymaster,
        paymasterAddress,
        bundler: {
          address: tx.from,
          name: bundlerName,
        },
        gasInfo: {
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: ethers.formatUnits(receipt.gasPrice || 0, "gwei") + " gwei",
          totalCost: ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n)) + " ETH",
          paidBy: gasPaidBy,
        },
        userOperation: userOpDetails,
        summary: usedPaymaster
          ? `This transaction used a Paymaster for gas sponsorship`
          : `This transaction did NOT use a Paymaster (user paid for gas)`,
      };
    } catch (error: any) {
      return {
        error: true,
        message: error.message || "Failed to analyze transaction",
        txHash,
      };
    }
  }
}

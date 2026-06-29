import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import {
  registryActions,
  stakingActions,
  tokenActions,
  applyConfig,
  CHAIN_SEPOLIA,
  REGISTRY_ADDRESS as CORE_REGISTRY_ADDRESS,
  GTOKEN_ADDRESS as CORE_GTOKEN_ADDRESS,
  GTOKEN_STAKING_ADDRESS as CORE_GTOKEN_STAKING_ADDRESS,
  SUPER_PAYMASTER_ADDRESS as CORE_SUPER_PAYMASTER_ADDRESS,
  PAYMASTER_FACTORY_ADDRESS as CORE_PAYMASTER_FACTORY_ADDRESS,
  ROLE_PAYMASTER_AOA,
  ROLE_PAYMASTER_SUPER,
} from "@aastar/sdk/core";
import type { Address } from "viem";

@Injectable()
export class OperatorService implements OnModuleInit {
  private readonly logger = new Logger(OperatorService.name);

  private publicClient: any;
  private registryAddress: Address;
  private gtokenAddress: Address;
  private stakingAddress: Address;
  private superPaymasterAddress: Address;
  private paymasterFactoryAddress: Address;
  private chainId: number;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.chainId = this.configService.get<number>("registryChainId") ?? CHAIN_SEPOLIA;
    applyConfig({ chainId: this.chainId });

    const rpcUrl = this.configService.get<string>("ethRpcUrl");
    this.publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    this.registryAddress = (this.configService.get<string>("registryAddress") ||
      CORE_REGISTRY_ADDRESS) as Address;
    this.gtokenAddress = (this.configService.get<string>("gtokenAddress") ||
      CORE_GTOKEN_ADDRESS) as Address;
    this.stakingAddress = (this.configService.get<string>("stakingAddress") ||
      CORE_GTOKEN_STAKING_ADDRESS) as Address;
    this.superPaymasterAddress = (this.configService.get<string>("superPaymasterAddress") ||
      CORE_SUPER_PAYMASTER_ADDRESS) as Address;
    this.paymasterFactoryAddress = (this.configService.get<string>("paymasterFactoryAddress") ||
      CORE_PAYMASTER_FACTORY_ADDRESS) as Address;

    this.logger.log(`SuperPaymaster: ${this.superPaymasterAddress}`);
    this.logger.log(`PaymasterFactory: ${this.paymasterFactoryAddress}`);
  }

  // ── Role Checks ──────────────────────────────────────────────────────────────

  async getOperatorRoles(address: Address): Promise<{
    isSPO: boolean;
    isV4Operator: boolean;
  }> {
    try {
      const r = registryActions(this.registryAddress)(this.publicClient);
      const [isSPO, isV4Operator] = await Promise.all([
        r.hasRole({ roleId: ROLE_PAYMASTER_AOA, user: address }),
        r.hasRole({ roleId: ROLE_PAYMASTER_SUPER, user: address }),
      ]);
      return { isSPO, isV4Operator };
    } catch (error) {
      this.logger.error(`Failed to fetch operator roles for ${address}`, error);
      return { isSPO: false, isV4Operator: false };
    }
  }

  // ── SPO Status ───────────────────────────────────────────────────────────────

  async getSPOStatus(address: Address): Promise<{
    hasRole: boolean;
    isConfigured: boolean;
    balance: string;
    exchangeRate: string;
    treasury: Address;
    stakeAmount: string;
  } | null> {
    try {
      const r = registryActions(this.registryAddress)(this.publicClient);
      const hasRole = await r.hasRole({ roleId: ROLE_PAYMASTER_AOA, user: address });

      const operatorsAbi = parseAbi([
        "function operators(address) view returns (uint128 balance, uint96 exchangeRate, bool isConfigured, bool isPaused, address token, uint32 reputation, address treasury, uint256 spent, uint256 txSponsored)",
      ]);

      const [operatorData, stakeData] = await Promise.all([
        this.publicClient.readContract({
          address: this.superPaymasterAddress,
          abi: operatorsAbi,
          functionName: "operators",
          args: [address],
        }),
        hasRole
          ? stakingActions(this.stakingAddress)(this.publicClient)
              .getStakeInfo({ operator: address, roleId: ROLE_PAYMASTER_AOA })
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      const op = operatorData as any;
      return {
        hasRole,
        isConfigured: op[2] ?? false,
        balance: formatUnits(op[0] ?? 0n, 18),
        exchangeRate: op[1]?.toString() ?? "0",
        treasury: (op[6] ?? "0x0000000000000000000000000000000000000000") as Address,
        stakeAmount: stakeData ? formatUnits((stakeData as any).amount ?? 0n, 18) : "0",
      };
    } catch {
      return null;
    }
  }

  // ── V4 Paymaster Status ──────────────────────────────────────────────────────

  async getV4PaymasterStatus(address: Address): Promise<{
    paymasterAddress: Address | null;
    balance: string;
    hasRole: boolean;
  }> {
    const factoryAbi = parseAbi([
      "function getPaymasterByOperator(address) view returns (address)",
    ]);

    const r = registryActions(this.registryAddress)(this.publicClient);
    const [hasRole, pmAddr] = await Promise.all([
      r.hasRole({ roleId: ROLE_PAYMASTER_SUPER, user: address }),
      this.publicClient
        .readContract({
          address: this.paymasterFactoryAddress,
          abi: factoryAbi,
          functionName: "getPaymasterByOperator",
          args: [address],
        })
        .catch(() => null),
    ]);

    const zeroAddr = "0x0000000000000000000000000000000000000000";
    if (!pmAddr || pmAddr === zeroAddr) {
      return { paymasterAddress: null, balance: "0", hasRole };
    }

    const balance = await this.publicClient.getBalance({ address: pmAddr });
    return {
      paymasterAddress: pmAddr as Address,
      balance: formatUnits(balance, 18),
      hasRole,
    };
  }

  // ── GToken Balance ───────────────────────────────────────────────────────────

  async getGTokenBalance(address: Address): Promise<string> {
    const balance = await tokenActions(this.gtokenAddress)(this.publicClient).balanceOf({
      token: this.gtokenAddress,
      account: address,
    });
    return formatUnits(balance, 18);
  }

  // ── All SPO Operators ────────────────────────────────────────────────────────

  async getAllSPOOperators(): Promise<Address[]> {
    return registryActions(this.registryAddress)(this.publicClient).getRoleMembers({
      roleId: ROLE_PAYMASTER_AOA,
    });
  }

  async getAllV4Operators(): Promise<Address[]> {
    return registryActions(this.registryAddress)(this.publicClient).getRoleMembers({
      roleId: ROLE_PAYMASTER_SUPER,
    });
  }

  // ── Full Operator Dashboard ──────────────────────────────────────────────────

  async getOperatorDashboard(address: Address) {
    const [roles, gtokenBalance] = await Promise.all([
      this.getOperatorRoles(address),
      this.getGTokenBalance(address),
    ]);

    const [spoStatus, v4Status] = await Promise.all([
      roles.isSPO ? this.getSPOStatus(address) : Promise.resolve(null),
      this.getV4PaymasterStatus(address),
    ]);

    return {
      address,
      isSPO: roles.isSPO,
      isV4Operator: roles.isV4Operator,
      gtokenBalance,
      spoStatus,
      v4Status,
      registryAddress: this.registryAddress,
      superPaymasterAddress: this.superPaymasterAddress,
      paymasterFactoryAddress: this.paymasterFactoryAddress,
      stakingAddress: this.stakingAddress,
    };
  }

  // ── Contract Addresses ───────────────────────────────────────────────────────

  getContractAddresses() {
    return {
      registryAddress: this.registryAddress,
      gtokenAddress: this.gtokenAddress,
      stakingAddress: this.stakingAddress,
      superPaymasterAddress: this.superPaymasterAddress,
      paymasterFactoryAddress: this.paymasterFactoryAddress,
      roleSPO: ROLE_PAYMASTER_AOA,
      roleV4: ROLE_PAYMASTER_SUPER,
    };
  }
}

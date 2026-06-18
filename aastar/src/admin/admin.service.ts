import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import {
  registryActions,
  tokenActions,
  applyConfig,
  CHAIN_SEPOLIA,
  REGISTRY_ADDRESS as CORE_REGISTRY_ADDRESS,
  GTOKEN_ADDRESS as CORE_GTOKEN_ADDRESS,
  GTOKEN_STAKING_ADDRESS as CORE_GTOKEN_STAKING_ADDRESS,
  SUPER_PAYMASTER_ADDRESS as CORE_SUPER_PAYMASTER_ADDRESS,
  PAYMASTER_FACTORY_ADDRESS as CORE_PAYMASTER_FACTORY_ADDRESS,
  XPNTS_FACTORY_ADDRESS as CORE_XPNTS_FACTORY_ADDRESS,
  SBT_ADDRESS as CORE_SBT_ADDRESS,
  DEFAULT_ADMIN_ROLE,
  ROLE_COMMUNITY,
  ROLE_PAYMASTER_AOA,
  ROLE_PAYMASTER_SUPER,
  ROLE_ENDUSER,
} from "@aastar/sdk/core";
import type { Address, Hex } from "viem";

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  private publicClient: any;
  private registryAddress: Address;
  private gtokenAddress: Address;
  private stakingAddress: Address;
  private superPaymasterAddress: Address;
  private paymasterFactoryAddress: Address;
  private xpntsFactoryAddress: Address;
  private sbtAddress: Address;
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
    this.xpntsFactoryAddress = (this.configService.get<string>("xpntsFactoryAddress") ||
      CORE_XPNTS_FACTORY_ADDRESS) as Address;
    this.sbtAddress = (this.configService.get<string>("mysbtAddress") ||
      CORE_SBT_ADDRESS) as Address;

    this.logger.log(`Admin service initialized for chain ${this.chainId}`);
  }

  // ── Admin Role Check ─────────────────────────────────────────────────────────

  async isProtocolAdmin(address: Address): Promise<boolean> {
    return registryActions(this.registryAddress)(this.publicClient).hasRole({
      roleId: DEFAULT_ADMIN_ROLE,
      user: address,
    });
  }

  // ── Role Configurations ──────────────────────────────────────────────────────

  async getRoleConfig(roleId: Hex) {
    const cfg = await registryActions(this.registryAddress)(this.publicClient).getRoleConfig({
      roleId,
    });
    return {
      minStake: formatUnits(cfg.minStake, 18),
      // SDK 0.20.x renamed RoleConfigDetailed.entryBurn → ticketPrice; keep the
      // API field name `entryBurn` for the frontend contract.
      entryBurn: formatUnits(cfg.ticketPrice, 18),
      exitFeePercent: cfg.exitFeePercent.toString(),
      isActive: cfg.isActive,
      description: cfg.description,
      owner: cfg.owner,
    };
  }

  async getAllRoleConfigs() {
    const roles = [
      { name: "Community Admin", id: ROLE_COMMUNITY },
      { name: "SPO (Paymaster AOA)", id: ROLE_PAYMASTER_AOA },
      { name: "V4 Operator (Paymaster Super)", id: ROLE_PAYMASTER_SUPER },
      { name: "End User", id: ROLE_ENDUSER },
    ];

    const configs = await Promise.allSettled(
      roles.map(async r => ({
        name: r.name,
        roleId: r.id,
        config: await this.getRoleConfig(r.id),
        memberCount: (
          await registryActions(this.registryAddress)(this.publicClient).getRoleUserCount({
            roleId: r.id,
          })
        ).toString(),
      }))
    );

    return configs
      .filter(c => c.status === "fulfilled")
      .map(c => (c as PromiseFulfilledResult<any>).value);
  }

  // ── Registry Stats ───────────────────────────────────────────────────────────

  async getRegistryStats() {
    try {
      const r = registryActions(this.registryAddress)(this.publicClient);
      const [communityCount, spoCount, v4Count, endUserCount, registryOwner, registryVersion] =
        await Promise.all([
          r.getRoleUserCount({ roleId: ROLE_COMMUNITY }),
          r.getRoleUserCount({ roleId: ROLE_PAYMASTER_AOA }),
          r.getRoleUserCount({ roleId: ROLE_PAYMASTER_SUPER }),
          r.getRoleUserCount({ roleId: ROLE_ENDUSER }),
          r.owner(),
          r.version().catch(() => "unknown"),
        ]);

      return {
        registryAddress: this.registryAddress,
        owner: registryOwner,
        version: registryVersion,
        roleCounts: {
          communityAdmin: communityCount.toString(),
          spo: spoCount.toString(),
          v4Operator: v4Count.toString(),
          endUser: endUserCount.toString(),
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch registry stats", error);
      return {
        registryAddress: this.registryAddress,
        owner: "unknown",
        version: "unknown",
        roleCounts: { communityAdmin: "0", spo: "0", v4Operator: "0", endUser: "0" },
      };
    }
  }

  // ── GToken Stats ─────────────────────────────────────────────────────────────

  async getGTokenStats() {
    try {
      const t = tokenActions(this.gtokenAddress)(this.publicClient);
      const [totalSupply, name, symbol] = await Promise.all([
        t.totalSupply({ token: this.gtokenAddress }),
        t.name({ token: this.gtokenAddress }),
        t.symbol({ token: this.gtokenAddress }),
      ]);

      // Check staking contract GToken balance
      const stakingBalance = await t.balanceOf({
        token: this.gtokenAddress,
        account: this.stakingAddress,
      });

      return {
        address: this.gtokenAddress,
        name,
        symbol,
        totalSupply: formatUnits(totalSupply, 18),
        stakingContractBalance: formatUnits(stakingBalance, 18),
      };
    } catch (error) {
      this.logger.error("Failed to fetch GToken stats", error);
      return {
        address: this.gtokenAddress,
        name: "unknown",
        symbol: "unknown",
        totalSupply: "0",
        stakingContractBalance: "0",
      };
    }
  }

  // ── SuperPaymaster Stats ─────────────────────────────────────────────────────

  async getSuperPaymasterStats() {
    const statsAbi = parseAbi([
      "function getStats() view returns (uint256 totalOperators, uint256 activeOperators, uint256 totalSponsored, uint256 totalFees)",
    ]);

    try {
      const stats = await this.publicClient.readContract({
        address: this.superPaymasterAddress,
        abi: statsAbi,
        functionName: "getStats",
      });
      return {
        address: this.superPaymasterAddress,
        totalOperators: (stats as any)[0]?.toString(),
        activeOperators: (stats as any)[1]?.toString(),
        totalSponsored: (stats as any)[2]?.toString(),
        totalFees: (stats as any)[3]?.toString(),
      };
    } catch {
      return { address: this.superPaymasterAddress };
    }
  }

  // ── Full Protocol Dashboard ──────────────────────────────────────────────────

  async getProtocolDashboard(userAddress?: Address) {
    const [registryStats, roleConfigs, gtokenStats] = await Promise.all([
      this.getRegistryStats(),
      this.getAllRoleConfigs(),
      this.getGTokenStats(),
    ]);

    const isAdmin = userAddress ? await this.isProtocolAdmin(userAddress) : false;

    return {
      isAdmin,
      userAddress,
      registryStats,
      roleConfigs,
      gtokenStats,
      systemAddresses: {
        registry: this.registryAddress,
        gtoken: this.gtokenAddress,
        staking: this.stakingAddress,
        superPaymaster: this.superPaymasterAddress,
        paymasterFactory: this.paymasterFactoryAddress,
        xpntsFactory: this.xpntsFactoryAddress,
        sbt: this.sbtAddress,
      },
      chainId: this.chainId,
    };
  }
}

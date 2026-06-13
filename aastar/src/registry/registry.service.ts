import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicClient, http } from "viem";
import {
  registryActions,
  tokenActions,
  applyConfig,
  CHAIN_SEPOLIA,
  REGISTRY_ADDRESS as CORE_REGISTRY_ADDRESS,
  GTOKEN_ADDRESS as CORE_GTOKEN_ADDRESS,
  ROLE_COMMUNITY,
  ROLE_PAYMASTER_AOA,
  ROLE_PAYMASTER_SUPER,
  DEFAULT_ADMIN_ROLE,
  ROLE_ENDUSER,
} from "@aastar/core";
import type { Address, Hex } from "viem";

@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger(RegistryService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  private registryAddress: Address;
  private gtokenAddress: Address;
  private chainId: number;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    // Must be called before accessing any contract addresses.
    // Single source for the portal chain — override via REGISTRY_CHAIN_ID env, defaults to Sepolia.
    this.chainId = this.configService.get<number>("registryChainId") ?? CHAIN_SEPOLIA;
    applyConfig({ chainId: this.chainId });

    const rpcUrl = this.configService.get<string>("ethRpcUrl");
    this.publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    // Env overrides canonical defaults; after applyConfig, CORE_* are defined
    this.registryAddress = (this.configService.get<string>("registryAddress") ||
      CORE_REGISTRY_ADDRESS) as Address;

    this.gtokenAddress = (this.configService.get<string>("gtokenAddress") ||
      CORE_GTOKEN_ADDRESS) as Address;

    this.logger.log(`Registry: ${this.registryAddress}`);
    this.logger.log(`GToken: ${this.gtokenAddress}`);
  }

  // ── Role Query ──────────────────────────────────────────────────────────────

  async getUserRoles(userAddress: Address): Promise<{
    isAdmin: boolean;
    isCommunityAdmin: boolean;
    isSPO: boolean;
    isV4Operator: boolean;
    isEndUser: boolean;
    roleIds: Hex[];
  }> {
    try {
      const r = registryActions(this.registryAddress)(this.publicClient);

      const [isAdmin, isCommunityAdmin, isSPO, isV4Operator, isEndUser, roleIds] =
        await Promise.all([
          r.hasRole({ roleId: DEFAULT_ADMIN_ROLE, user: userAddress }),
          r.hasRole({ roleId: ROLE_COMMUNITY, user: userAddress }),
          r.hasRole({ roleId: ROLE_PAYMASTER_AOA, user: userAddress }),
          r.hasRole({ roleId: ROLE_PAYMASTER_SUPER, user: userAddress }),
          r.hasRole({ roleId: ROLE_ENDUSER, user: userAddress }),
          r.getUserRoles({ user: userAddress }),
        ]);

      return { isAdmin, isCommunityAdmin, isSPO, isV4Operator, isEndUser, roleIds };
    } catch (error) {
      this.logger.error(`Failed to fetch user roles for ${userAddress}`, error);
      return {
        isAdmin: false,
        isCommunityAdmin: false,
        isSPO: false,
        isV4Operator: false,
        isEndUser: false,
        roleIds: [],
      };
    }
  }

  async getRoleConfig(roleId: Hex) {
    return registryActions(this.registryAddress)(this.publicClient).getRoleConfig({ roleId });
  }

  async getRoleMembers(roleId: Hex): Promise<Address[]> {
    return registryActions(this.registryAddress)(this.publicClient).getRoleMembers({ roleId });
  }

  async getRoleUserCount(roleId: Hex): Promise<bigint> {
    return registryActions(this.registryAddress)(this.publicClient).getRoleUserCount({ roleId });
  }

  // ── GToken Balance ──────────────────────────────────────────────────────────

  async getGTokenBalance(userAddress: Address): Promise<bigint> {
    return tokenActions(this.gtokenAddress)(this.publicClient).balanceOf({
      token: this.gtokenAddress,
      account: userAddress,
    });
  }

  // ── Community Lookup ────────────────────────────────────────────────────────

  async getCommunityByName(name: string): Promise<Address> {
    return registryActions(this.registryAddress)(this.publicClient).communityByName({ name });
  }

  // ── Registry Info ───────────────────────────────────────────────────────────

  async getRegistryInfo() {
    try {
      const r = registryActions(this.registryAddress)(this.publicClient);

      const [communityCount, spoCount, v4Count, endUserCount] = await Promise.all([
        r.getRoleUserCount({ roleId: ROLE_COMMUNITY }),
        r.getRoleUserCount({ roleId: ROLE_PAYMASTER_AOA }),
        r.getRoleUserCount({ roleId: ROLE_PAYMASTER_SUPER }),
        r.getRoleUserCount({ roleId: ROLE_ENDUSER }),
      ]);

      return {
        registryAddress: this.registryAddress,
        chainId: this.chainId,
        roleCounts: {
          communityAdmin: communityCount.toString(),
          spo: spoCount.toString(),
          v4Operator: v4Count.toString(),
          endUser: endUserCount.toString(),
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch registry info", error);
      return {
        registryAddress: this.registryAddress,
        chainId: this.chainId,
        roleCounts: { communityAdmin: "0", spo: "0", v4Operator: "0", endUser: "0" },
      };
    }
  }

  // ── Role IDs Exposure ───────────────────────────────────────────────────────

  getRoleIds() {
    return {
      DEFAULT_ADMIN_ROLE,
      ROLE_COMMUNITY,
      ROLE_PAYMASTER_AOA,
      ROLE_PAYMASTER_SUPER,
      ROLE_ENDUSER,
    };
  }
}

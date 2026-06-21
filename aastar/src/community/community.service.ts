import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createPublicClient,
  http,
  formatUnits,
  decodeAbiParameters,
  parseAbiParameters,
} from "viem";
import {
  registryActions,
  tokenActions,
  xPNTsFactoryActions,
  applyConfig,
  CHAIN_SEPOLIA,
  REGISTRY_ADDRESS as CORE_REGISTRY_ADDRESS,
  GTOKEN_ADDRESS as CORE_GTOKEN_ADDRESS,
  XPNTS_FACTORY_ADDRESS as CORE_XPNTS_FACTORY_ADDRESS,
  ROLE_COMMUNITY,
} from "@aastar/sdk/core";
import type { Address, Hex } from "viem";

@Injectable()
export class CommunityService implements OnModuleInit {
  private readonly logger = new Logger(CommunityService.name);

  private publicClient: any;
  private registryAddress: Address;
  private gtokenAddress: Address;
  private xpntsFactoryAddress: Address;
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
    this.xpntsFactoryAddress = (this.configService.get<string>("xpntsFactoryAddress") ||
      CORE_XPNTS_FACTORY_ADDRESS) as Address;

    this.logger.log(`Registry: ${this.registryAddress}`);
    this.logger.log(`xPNTsFactory: ${this.xpntsFactoryAddress}`);
  }

  // ── Community Members ───────────────────────────────────────────────────────

  async getCommunityAdmins(): Promise<Address[]> {
    return registryActions(this.registryAddress)(this.publicClient).getRoleMembers({
      roleId: ROLE_COMMUNITY,
    });
  }

  async isCommunityAdmin(address: Address): Promise<boolean> {
    return registryActions(this.registryAddress)(this.publicClient).hasRole({
      roleId: ROLE_COMMUNITY,
      user: address,
    });
  }

  // ── Community Info from Registry Metadata ───────────────────────────────────

  async getCommunityMetadata(address: Address): Promise<{
    name: string;
    ensName: string;
    website: string;
    description: string;
    logoURI: string;
    stakeAmount: string;
  } | null> {
    try {
      const r = registryActions(this.registryAddress)(this.publicClient);
      const metadataHex = (await r.roleMetadata({
        roleId: ROLE_COMMUNITY,
        user: address,
      })) as Hex;

      if (!metadataHex || metadataHex === "0x") return null;

      // Decode: struct CommunityRoleData { string name; string ensName; string website; string description; string logoURI; uint256 stakeAmount; }
      let dataToDecode = metadataHex;
      if (
        metadataHex.startsWith("0x0000000000000000000000000000000000000000000000000000000000000020")
      ) {
        dataToDecode = `0x${metadataHex.slice(66)}` as Hex;
      }

      const [name, ensName, website, description, logoURI, stakeAmount] = decodeAbiParameters(
        parseAbiParameters("string, string, string, string, string, uint256"),
        dataToDecode
      );

      return {
        name: name as string,
        ensName: ensName as string,
        website: website as string,
        description: description as string,
        logoURI: logoURI as string,
        stakeAmount: formatUnits(stakeAmount as bigint, 18),
      };
    } catch {
      return null;
    }
  }

  // ── xPNTs Token Info ─────────────────────────────────────────────────────────

  async getDeployedTokenAddress(communityAddress: Address): Promise<Address | null> {
    try {
      const addr = await xPNTsFactoryActions(this.xpntsFactoryAddress)(
        this.publicClient
      ).getTokenAddress({ community: communityAddress });
      if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
      return addr;
    } catch {
      return null;
    }
  }

  async getTokenInfo(tokenAddress: Address): Promise<{
    name: string;
    symbol: string;
    totalSupply: string;
    communityName: string;
    communityOwner: Address;
  } | null> {
    try {
      const t = tokenActions(tokenAddress)(this.publicClient);
      const [name, symbol, totalSupply, metadata] = await Promise.all([
        t.name({ token: tokenAddress }),
        t.symbol({ token: tokenAddress }),
        t.totalSupply({ token: tokenAddress }),
        t.getMetadata({ token: tokenAddress }),
      ]);
      return {
        name,
        symbol,
        totalSupply: formatUnits(totalSupply, 18),
        communityName: metadata.communityName,
        communityOwner: metadata.communityOwner,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch token info for ${tokenAddress}`, error);
      return null;
    }
  }

  async getTokenBalance(tokenAddress: Address, userAddress: Address): Promise<string> {
    const balance = await tokenActions(tokenAddress)(this.publicClient).balanceOf({
      token: tokenAddress,
      account: userAddress,
    });
    return formatUnits(balance, 18);
  }

  async getGTokenBalance(userAddress: Address): Promise<string> {
    const balance = await tokenActions(this.gtokenAddress)(this.publicClient).balanceOf({
      token: this.gtokenAddress,
      account: userAddress,
    });
    return formatUnits(balance, 18);
  }

  // ── Full Community Dashboard ─────────────────────────────────────────────────

  async getCommunityDashboard(address: Address) {
    const [isAdmin, metadata, gtokenBalance] = await Promise.all([
      this.isCommunityAdmin(address),
      this.getCommunityMetadata(address),
      this.getGTokenBalance(address),
    ]);

    let tokenAddress: Address | null = null;
    let tokenInfo = null;
    let xpntsBalance: string | null = null;

    if (isAdmin) {
      tokenAddress = await this.getDeployedTokenAddress(address);
      if (tokenAddress) {
        [tokenInfo, xpntsBalance] = await Promise.all([
          this.getTokenInfo(tokenAddress),
          this.getTokenBalance(tokenAddress, address),
        ]);
      }
    }

    return {
      address,
      isAdmin,
      metadata,
      gtokenBalance,
      tokenAddress,
      tokenInfo,
      xpntsBalance,
      registryAddress: this.registryAddress,
      xpntsFactoryAddress: this.xpntsFactoryAddress,
    };
  }

  // ── Community List ────────────────────────────────────────────────────────────

  async getAllCommunities(): Promise<
    {
      address: Address;
      metadata: Awaited<ReturnType<CommunityService["getCommunityMetadata"]>>;
      tokenAddress: Address | null;
      tokenInfo: Awaited<ReturnType<CommunityService["getTokenInfo"]>> | null;
    }[]
  > {
    const members = await this.getCommunityAdmins();
    const results = await Promise.allSettled(
      members.map(async addr => {
        const tokenAddress = await this.getDeployedTokenAddress(addr);
        // Registry metadata (name/ENS/logo) is frequently unset on-chain; the token
        // carries the authoritative community name + token name/symbol, so include it
        // here as the display fallback (e.g. "AAStar", "Mycelium Community").
        const [metadata, tokenInfo] = await Promise.all([
          this.getCommunityMetadata(addr),
          tokenAddress ? this.getTokenInfo(tokenAddress).catch(() => null) : Promise.resolve(null),
        ]);
        return { address: addr, metadata, tokenAddress, tokenInfo };
      })
    );
    return results
      .filter(r => r.status === "fulfilled")
      .map(r => (r as PromiseFulfilledResult<any>).value);
  }

  // ── Contract Addresses (for frontend tx encoding) ────────────────────────────

  getContractAddresses() {
    return {
      registryAddress: this.registryAddress,
      gtokenAddress: this.gtokenAddress,
      xpntsFactoryAddress: this.xpntsFactoryAddress,
      roleCommunity: ROLE_COMMUNITY,
    };
  }
}

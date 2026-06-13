import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import type { Address } from "viem";

// ── ABIs ─────────────────────────────────────────────────────────────────────

const SALE_CONTRACT_ABI = parseAbi([
  "function getCurrentPriceUSD() view returns (uint256)",
  "function tokensSold() view returns (uint256)",
  "function totalTokensForSale() view returns (uint256)",
  "function hasBought(address) view returns (bool)",
  "function treasury() view returns (address)",
  "function STAGE1_TOKEN_LIMIT() view returns (uint256)",
  "function STAGE2_TOKEN_LIMIT() view returns (uint256)",
  "function CEILING_PRICE_USD() view returns (uint256)",
  "event TokensPurchased(address indexed buyer, uint256 gTokenAmount, uint256 usdValue)",
]);

const APNTS_SALE_ABI = parseAbi([
  "function priceUSD() view returns (uint256)",
  "function totalSold() view returns (uint256)",
  "function availableInventory() view returns (uint256)",
  "function minPurchaseAmount() view returns (uint256)",
  "function maxPurchaseAmount() view returns (uint256)",
  "function getAPNTsForUSD(uint256 usdAmount) view returns (uint256)",
  "function getUSDForAPNTs(uint256 aPNTsAmount) view returns (uint256)",
  "event APNTsPurchased(address indexed buyer, address indexed paymentToken, uint256 aPNTsAmount, uint256 usdAmount, uint256 priceUsed)",
]);

@Injectable()
export class SaleService implements OnModuleInit {
  private readonly logger = new Logger(SaleService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;

  // Contract addresses from env
  private gTokenSaleAddress: Address | null = null;
  private aPNTsSaleAddress: Address | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>("ethRpcUrl");
    this.publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    const gTokenSale = this.configService.get<string>("gTokenSaleAddress");
    const aPNTsSale = this.configService.get<string>("aPNTsSaleAddress");

    this.gTokenSaleAddress = gTokenSale ? (gTokenSale as Address) : null;
    this.aPNTsSaleAddress = aPNTsSale ? (aPNTsSale as Address) : null;

    this.logger.log(`GToken Sale: ${this.gTokenSaleAddress || "not configured"}`);
    this.logger.log(`aPNTs Sale: ${this.aPNTsSaleAddress || "not configured"}`);
  }

  // ── GToken Sale ───────────────────────────────────────────────────────────────

  async getGTokenSaleStatus() {
    if (!this.gTokenSaleAddress) {
      return { configured: false, address: null };
    }

    try {
      const [currentPrice, tokensSold, totalForSale, stage1Limit, stage2Limit, ceilingPrice] =
        await Promise.all([
          this.publicClient.readContract({
            address: this.gTokenSaleAddress,
            abi: SALE_CONTRACT_ABI,
            functionName: "getCurrentPriceUSD",
          }),
          this.publicClient.readContract({
            address: this.gTokenSaleAddress,
            abi: SALE_CONTRACT_ABI,
            functionName: "tokensSold",
          }),
          this.publicClient.readContract({
            address: this.gTokenSaleAddress,
            abi: SALE_CONTRACT_ABI,
            functionName: "totalTokensForSale",
          }),
          this.publicClient.readContract({
            address: this.gTokenSaleAddress,
            abi: SALE_CONTRACT_ABI,
            functionName: "STAGE1_TOKEN_LIMIT",
          }),
          this.publicClient.readContract({
            address: this.gTokenSaleAddress,
            abi: SALE_CONTRACT_ABI,
            functionName: "STAGE2_TOKEN_LIMIT",
          }),
          this.publicClient.readContract({
            address: this.gTokenSaleAddress,
            abi: SALE_CONTRACT_ABI,
            functionName: "CEILING_PRICE_USD",
          }),
        ]);

      const sold = tokensSold as bigint;
      const total = totalForSale as bigint;
      const stage1 = stage1Limit as bigint;
      const stage2 = stage2Limit as bigint;

      const soldPct = total > 0n ? Number((sold * 10000n) / total) / 100 : 0;
      const currentStage = sold < stage1 ? 1 : sold < stage2 ? 2 : sold < total ? 3 : 0; // 0 = ended

      return {
        configured: true,
        address: this.gTokenSaleAddress,
        currentPriceUSD: formatUnits(currentPrice as bigint, 6),
        ceilingPriceUSD: formatUnits(ceilingPrice as bigint, 6),
        tokensSold: formatUnits(sold, 18),
        totalForSale: formatUnits(total, 18),
        soldPercent: soldPct,
        currentStage,
        saleEnded: sold >= total,
        stage1Limit: formatUnits(stage1, 18),
        stage2Limit: formatUnits(stage2, 18),
      };
    } catch (error) {
      this.logger.error("Failed to fetch GToken sale status", error);
      return { configured: true, address: this.gTokenSaleAddress, error: "Contract call failed" };
    }
  }

  async checkGTokenHasBought(userAddress: Address): Promise<boolean> {
    if (!this.gTokenSaleAddress) return false;
    return this.publicClient.readContract({
      address: this.gTokenSaleAddress,
      abi: SALE_CONTRACT_ABI,
      functionName: "hasBought",
      args: [userAddress],
    });
  }

  async getGTokenSaleEvents(fromBlock?: bigint) {
    if (!this.gTokenSaleAddress) return [];
    try {
      // Bound the scan window: scanning from genesis times out / rate-limits on non-archive nodes.
      // Default to the last SALE_EVENTS_BLOCK_LOOKBACK blocks (env-configurable) unless an explicit
      // fromBlock is passed in.
      const latestBlock = await this.publicClient.getBlockNumber();
      const lookback = BigInt(process.env.SALE_EVENTS_BLOCK_LOOKBACK ?? "100000");
      const defaultFromBlock = latestBlock > lookback ? latestBlock - lookback : BigInt(0);
      const logs = await this.publicClient.getLogs({
        address: this.gTokenSaleAddress,
        // Look up the event by name (ABI-order-independent) instead of by array position.
        event: (SALE_CONTRACT_ABI as readonly any[]).find(
          x => x.type === "event" && x.name === "TokensPurchased"
        ) as any,
        fromBlock: fromBlock ?? defaultFromBlock,
        toBlock: "latest",
      });
      return logs.map((log: any) => ({
        buyer: log.args.buyer,
        gTokenAmount: formatUnits(log.args.gTokenAmount || 0n, 18),
        usdValue: formatUnits(log.args.usdValue || 0n, 6),
        blockNumber: log.blockNumber?.toString(),
        txHash: log.transactionHash,
      }));
    } catch {
      return [];
    }
  }

  // ── aPNTs Sale ────────────────────────────────────────────────────────────────

  async getAPNTsSaleStatus() {
    if (!this.aPNTsSaleAddress) {
      return { configured: false, address: null };
    }

    try {
      const [priceUSD, totalSold, inventory, minPurchase, maxPurchase] = await Promise.all([
        this.publicClient.readContract({
          address: this.aPNTsSaleAddress,
          abi: APNTS_SALE_ABI,
          functionName: "priceUSD",
        }),
        this.publicClient.readContract({
          address: this.aPNTsSaleAddress,
          abi: APNTS_SALE_ABI,
          functionName: "totalSold",
        }),
        this.publicClient.readContract({
          address: this.aPNTsSaleAddress,
          abi: APNTS_SALE_ABI,
          functionName: "availableInventory",
        }),
        this.publicClient.readContract({
          address: this.aPNTsSaleAddress,
          abi: APNTS_SALE_ABI,
          functionName: "minPurchaseAmount",
        }),
        this.publicClient.readContract({
          address: this.aPNTsSaleAddress,
          abi: APNTS_SALE_ABI,
          functionName: "maxPurchaseAmount",
        }),
      ]);

      return {
        configured: true,
        address: this.aPNTsSaleAddress,
        priceUSD: formatUnits(priceUSD as bigint, 6),
        totalSold: formatUnits(totalSold as bigint, 18),
        availableInventory: formatUnits(inventory as bigint, 18),
        minPurchaseAmount: formatUnits(minPurchase as bigint, 18),
        maxPurchaseAmount: formatUnits(maxPurchase as bigint, 18),
        saleActive: (inventory as bigint) > 0n,
      };
    } catch (error) {
      this.logger.error("Failed to fetch aPNTs sale status", error);
      return { configured: true, address: this.aPNTsSaleAddress, error: "Contract call failed" };
    }
  }

  async getAPNTsSaleQuote(usdAmount: string) {
    if (!this.aPNTsSaleAddress) return null;
    const usdAmountBigInt = BigInt(Math.floor(parseFloat(usdAmount) * 1e6));
    const aPNTsOut = await this.publicClient.readContract({
      address: this.aPNTsSaleAddress,
      abi: APNTS_SALE_ABI,
      functionName: "getAPNTsForUSD",
      args: [usdAmountBigInt],
    });
    return {
      usdIn: usdAmount,
      aPNTsOut: formatUnits(aPNTsOut as bigint, 18),
    };
  }

  // ── Combined Overview ─────────────────────────────────────────────────────────

  async getSaleOverview() {
    const [gTokenStatus, aPNTsStatus] = await Promise.all([
      this.getGTokenSaleStatus(),
      this.getAPNTsSaleStatus(),
    ]);
    return { gTokenSale: gTokenStatus, aPNTsSale: aPNTsStatus };
  }

  // ── Contract Addresses for Frontend ──────────────────────────────────────────

  getContractAddresses() {
    return {
      gTokenSaleAddress: this.gTokenSaleAddress,
      aPNTsSaleAddress: this.aPNTsSaleAddress,
    };
  }
}

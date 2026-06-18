import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SaleService } from "./sale.service";

const mockReadContract = jest.fn();
const mockGetLogs = jest.fn().mockResolvedValue([]);

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({
    readContract: mockReadContract,
    getLogs: mockGetLogs,
  })),
  http: jest.fn(),
  formatUnits: jest.fn((val: bigint, dec: number) => (Number(val) / Math.pow(10, dec)).toFixed(6)),
  parseAbi: jest.fn(() => []),
}));

jest.mock("viem/chains", () => ({
  sepolia: { id: 11155111 },
}));

describe("SaleService", () => {
  let service: SaleService;
  const mockConfigGet = jest.fn();

  beforeEach(async () => {
    mockConfigGet.mockImplementation((key: string) => {
      const cfg: Record<string, string> = {
        ethRpcUrl: "http://localhost:8545",
      };
      return cfg[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaleService,
        {
          provide: ConfigService,
          useValue: { get: mockConfigGet },
        },
      ],
    }).compile();

    service = module.get<SaleService>(SaleService);
    service.onModuleInit();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("getContractAddresses returns both sale addresses (null when not configured)", () => {
    const addrs = service.getContractAddresses();
    expect(addrs).toHaveProperty("gTokenSaleAddress");
    expect(addrs).toHaveProperty("aPNTsSaleAddress");
    // Both null since env vars not set
    expect(addrs.gTokenSaleAddress).toBeNull();
    expect(addrs.aPNTsSaleAddress).toBeNull();
  });

  it("getGTokenSaleStatus returns not-configured when address not set", async () => {
    const status = await service.getGTokenSaleStatus();
    expect(status.configured).toBe(false);
    expect(status.address).toBeNull();
  });

  it("getAPNTsSaleStatus returns not-configured when address not set", async () => {
    const status = await service.getAPNTsSaleStatus();
    expect(status.configured).toBe(false);
    expect(status.address).toBeNull();
  });

  it("getSaleOverview returns both statuses", async () => {
    const overview = await service.getSaleOverview();
    expect(overview).toHaveProperty("gTokenSale");
    expect(overview).toHaveProperty("aPNTsSale");
  });

  it("checkGTokenHasBought returns false when not configured", async () => {
    const result = await service.checkGTokenHasBought("0xaddr" as any);
    expect(result).toBe(false);
  });

  it("getAPNTsSaleQuote returns null when not configured", async () => {
    const result = await service.getAPNTsSaleQuote("100");
    expect(result).toBeNull();
  });

  describe("when sale contracts are configured", () => {
    beforeEach(async () => {
      mockConfigGet.mockImplementation((key: string) => {
        const cfg: Record<string, string> = {
          ethRpcUrl: "http://localhost:8545",
          gTokenSaleAddress: "0xgTokenSale",
          aPNTsSaleAddress: "0xaPNTsSale",
        };
        return cfg[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [SaleService, { provide: ConfigService, useValue: { get: mockConfigGet } }],
      }).compile();

      service = module.get<SaleService>(SaleService);
      service.onModuleInit();
    });

    it("getContractAddresses returns configured addresses", () => {
      const addrs = service.getContractAddresses();
      expect(addrs.gTokenSaleAddress).toBe("0xgTokenSale");
      expect(addrs.aPNTsSaleAddress).toBe("0xaPNTsSale");
    });

    it("getGTokenSaleStatus calls readContract for each field", async () => {
      mockReadContract
        .mockResolvedValueOnce(BigInt("1000000")) // getCurrentPriceUSD
        .mockResolvedValueOnce(BigInt("100000000000000000000000")) // tokensSold
        .mockResolvedValueOnce(BigInt("1050000000000000000000000")) // totalTokensForSale
        .mockResolvedValueOnce(BigInt("210000000000000000000000")) // STAGE1_TOKEN_LIMIT
        .mockResolvedValueOnce(BigInt("630000000000000000000000")) // STAGE2_TOKEN_LIMIT
        .mockResolvedValueOnce(BigInt("4885000")); // CEILING_PRICE_USD

      const status = await service.getGTokenSaleStatus();
      expect(status.configured).toBe(true);
      expect(status.address).toBe("0xgTokenSale");
      expect(status).toHaveProperty("currentPriceUSD");
      expect(status).toHaveProperty("soldPercent");
      expect(status).toHaveProperty("currentStage");
    });

    it("getAPNTsSaleQuote returns quote when configured", async () => {
      mockReadContract.mockResolvedValueOnce(BigInt("5000000000000000000000")); // 5000 aPNTs for $100
      const quote = await service.getAPNTsSaleQuote("100");
      expect(quote).not.toBeNull();
      expect(quote).toHaveProperty("usdIn", "100");
      expect(quote).toHaveProperty("aPNTsOut");
    });
  });
});

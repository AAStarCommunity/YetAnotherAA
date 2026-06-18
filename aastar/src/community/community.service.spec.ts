import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { CommunityService } from "./community.service";

jest.mock("@aastar/sdk/core", () => ({
  registryActions: jest.fn(() =>
    jest.fn(() => ({
      getRoleMembers: jest.fn().mockResolvedValue(["0xadmin1", "0xadmin2"]),
      hasRole: jest.fn().mockResolvedValue(true),
      roleMetadata: jest.fn().mockResolvedValue("0x"),
      getRoleUserCount: jest.fn().mockResolvedValue(BigInt(5)),
    }))
  ),
  tokenActions: jest.fn(() =>
    jest.fn(() => ({
      balanceOf: jest.fn().mockResolvedValue(BigInt("5000000000000000000")), // 5 tokens
      name: jest.fn().mockResolvedValue("TestToken"),
      symbol: jest.fn().mockResolvedValue("TST"),
      totalSupply: jest.fn().mockResolvedValue(BigInt("1000000000000000000000")),
      getMetadata: jest.fn().mockResolvedValue({
        name: "TestToken",
        symbol: "TST",
        communityName: "TestCommunity",
        communityENS: "test.eth",
        communityOwner: "0xadmin1",
      }),
    }))
  ),
  xPNTsFactoryActions: jest.fn(() =>
    jest.fn(() => ({
      getTokenAddress: jest.fn().mockResolvedValue("0x0000000000000000000000000000000000000000"),
    }))
  ),
  applyConfig: jest.fn(),
  CHAIN_SEPOLIA: 11155111,
  REGISTRY_ADDRESS: "0xregistry",
  GTOKEN_ADDRESS: "0xgtoken",
  XPNTS_FACTORY_ADDRESS: "0xfactory",
  ROLE_COMMUNITY: "0xrolecommunity",
}));

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({})),
  http: jest.fn(),
  formatUnits: jest.fn((val: bigint, decimals: number) => {
    return (Number(val) / Math.pow(10, decimals)).toString();
  }),
}));

jest.mock("viem/chains", () => ({
  sepolia: { id: 11155111 },
}));

describe("CommunityService", () => {
  let service: CommunityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("http://localhost:8545"),
          },
        },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
    service.onModuleInit();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("getCommunityAdmins returns an array", async () => {
    const admins = await service.getCommunityAdmins();
    expect(Array.isArray(admins)).toBe(true);
    expect(admins.length).toBe(2);
  });

  it("isCommunityAdmin returns boolean", async () => {
    const result = await service.isCommunityAdmin("0xaddr" as any);
    expect(typeof result).toBe("boolean");
  });

  it("getCommunityMetadata returns null for empty metadata", async () => {
    const meta = await service.getCommunityMetadata("0xaddr" as any);
    expect(meta).toBeNull();
  });

  it("getDeployedTokenAddress returns null for zero address", async () => {
    const addr = await service.getDeployedTokenAddress("0xaddr" as any);
    expect(addr).toBeNull();
  });

  it("getContractAddresses returns required keys", () => {
    const addrs = service.getContractAddresses();
    expect(addrs).toHaveProperty("registryAddress");
    expect(addrs).toHaveProperty("gtokenAddress");
    expect(addrs).toHaveProperty("xpntsFactoryAddress");
    expect(addrs).toHaveProperty("roleCommunity");
  });
});

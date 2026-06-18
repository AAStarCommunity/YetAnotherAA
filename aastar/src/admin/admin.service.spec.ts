import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AdminService } from "./admin.service";

const mockRoleConfig = {
  minStake: BigInt("30000000000000000000"),
  ticketPrice: BigInt("0"),
  slashThreshold: 3,
  slashBase: 1,
  slashInc: 1,
  slashMax: 10,
  exitFeePercent: 5,
  isActive: true,
  minExitFee: BigInt("0"),
  description: "Role",
  owner: "0xowner",
  roleLockDuration: BigInt(86400),
};

jest.mock("@aastar/sdk/core", () => ({
  registryActions: jest.fn(() =>
    jest.fn(() => ({
      hasRole: jest.fn().mockResolvedValue(false),
      getRoleConfig: jest.fn().mockResolvedValue(mockRoleConfig),
      getRoleUserCount: jest.fn().mockResolvedValue(BigInt(10)),
      owner: jest.fn().mockResolvedValue("0xowner"),
      version: jest.fn().mockResolvedValue("1.0.0"),
    }))
  ),
  tokenActions: jest.fn(() =>
    jest.fn(() => ({
      totalSupply: jest.fn().mockResolvedValue(BigInt("21000000000000000000000000")),
      name: jest.fn().mockResolvedValue("GToken"),
      symbol: jest.fn().mockResolvedValue("GT"),
      balanceOf: jest.fn().mockResolvedValue(BigInt("1000000000000000000000")),
    }))
  ),
  applyConfig: jest.fn(),
  CHAIN_SEPOLIA: 11155111,
  REGISTRY_ADDRESS: "0xregistry",
  GTOKEN_ADDRESS: "0xgtoken",
  GTOKEN_STAKING_ADDRESS: "0xstaking",
  SUPER_PAYMASTER_ADDRESS: "0xsp",
  PAYMASTER_FACTORY_ADDRESS: "0xpmfactory",
  XPNTS_FACTORY_ADDRESS: "0xxpntsfactory",
  SBT_ADDRESS: "0xsbt",
  DEFAULT_ADMIN_ROLE: "0xadmin",
  ROLE_COMMUNITY: "0xcommunity",
  ROLE_PAYMASTER_AOA: "0xaoa",
  ROLE_PAYMASTER_SUPER: "0xsuper",
  ROLE_ENDUSER: "0xenduser",
}));

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({})),
  http: jest.fn(),
  formatUnits: jest.fn((val: bigint) => (Number(val) / 1e18).toString()),
  parseAbi: jest.fn(() => []),
}));

jest.mock("viem/chains", () => ({
  sepolia: { id: 11155111 },
}));

describe("AdminService", () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("http://localhost:8545"),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    service.onModuleInit();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("isProtocolAdmin returns boolean", async () => {
    const result = await service.isProtocolAdmin("0xaddr" as any);
    expect(typeof result).toBe("boolean");
  });

  it("getAllRoleConfigs returns array of role configs", async () => {
    const configs = await service.getAllRoleConfigs();
    expect(Array.isArray(configs)).toBe(true);
    if (configs.length > 0) {
      expect(configs[0]).toHaveProperty("name");
      expect(configs[0]).toHaveProperty("roleId");
      expect(configs[0]).toHaveProperty("config");
      expect(configs[0]).toHaveProperty("memberCount");
    }
  });

  it("getRegistryStats returns required fields", async () => {
    const stats = await service.getRegistryStats();
    expect(stats).toHaveProperty("registryAddress");
    expect(stats).toHaveProperty("roleCounts");
    expect(stats.roleCounts).toHaveProperty("communityAdmin");
    expect(stats.roleCounts).toHaveProperty("spo");
    expect(stats.roleCounts).toHaveProperty("v4Operator");
    expect(stats.roleCounts).toHaveProperty("endUser");
  });

  it("getGTokenStats returns required fields", async () => {
    const stats = await service.getGTokenStats();
    expect(stats).toHaveProperty("address");
    expect(stats).toHaveProperty("name");
    expect(stats).toHaveProperty("symbol");
    expect(stats).toHaveProperty("totalSupply");
    expect(stats).toHaveProperty("stakingContractBalance");
  });
});

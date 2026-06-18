import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { RegistryService } from "./registry.service";

// Mock @aastar/core to avoid real blockchain calls
jest.mock("@aastar/sdk/core", () => ({
  registryActions: jest.fn(() =>
    jest.fn(() => ({
      hasRole: jest.fn().mockResolvedValue(true),
      getUserRoles: jest.fn().mockResolvedValue(["0xrole1"]),
      getRoleConfig: jest.fn().mockResolvedValue({
        minStake: BigInt("30000000000000000000"),
        ticketPrice: BigInt("0"),
        slashThreshold: 3,
        slashBase: 1,
        slashInc: 1,
        slashMax: 10,
        exitFeePercent: 5,
        isActive: true,
        minExitFee: BigInt("0"),
        description: "Community Admin",
        owner: "0xowner",
        roleLockDuration: BigInt(86400),
      }),
      getRoleMembers: jest.fn().mockResolvedValue(["0xmember1", "0xmember2"]),
      getRoleUserCount: jest.fn().mockResolvedValue(BigInt(42)),
      communityByName: jest.fn().mockResolvedValue("0xcommunity"),
    }))
  ),
  tokenActions: jest.fn(() =>
    jest.fn(() => ({
      balanceOf: jest.fn().mockResolvedValue(BigInt("1000000000000000000")), // 1 GToken
    }))
  ),
  applyConfig: jest.fn(),
  CHAIN_SEPOLIA: 11155111,
  REGISTRY_ADDRESS: "0xregistry",
  GTOKEN_ADDRESS: "0xgtoken",
  ROLE_COMMUNITY: "0xrolecommunity",
  ROLE_PAYMASTER_AOA: "0xroleaoa",
  ROLE_PAYMASTER_SUPER: "0xrolespsuper",
  DEFAULT_ADMIN_ROLE: "0xadmin",
  ROLE_ENDUSER: "0xroleenduser",
}));

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({})),
  http: jest.fn(),
}));

jest.mock("viem/chains", () => ({
  sepolia: { id: 11155111, name: "sepolia" },
}));

describe("RegistryService", () => {
  let service: RegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistryService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const cfg: Record<string, string> = {
                ethRpcUrl: "http://localhost:8545",
                registryAddress: "0xregistry",
                gtokenAddress: "0xgtoken",
              };
              return cfg[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RegistryService>(RegistryService);
    service.onModuleInit();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return user roles", async () => {
    const roles = await service.getUserRoles("0xuser" as any);
    expect(roles).toHaveProperty("isAdmin");
    expect(roles).toHaveProperty("isCommunityAdmin");
    expect(roles).toHaveProperty("isSPO");
    expect(roles).toHaveProperty("isV4Operator");
    expect(roles).toHaveProperty("isEndUser");
    expect(roles).toHaveProperty("roleIds");
  });

  it("should return role members", async () => {
    const members = await service.getRoleMembers("0xrole" as any);
    expect(Array.isArray(members)).toBe(true);
  });

  it("should return role user count", async () => {
    const count = await service.getRoleUserCount("0xrole" as any);
    expect(typeof count).toBe("bigint");
  });

  it("should return GToken balance", async () => {
    const balance = await service.getGTokenBalance("0xuser" as any);
    expect(typeof balance).toBe("bigint");
  });

  it("should return community by name", async () => {
    const community = await service.getCommunityByName("TestCommunity");
    expect(typeof community).toBe("string");
  });

  it("should return registry info with role counts", async () => {
    const info = await service.getRegistryInfo();
    expect(info).toHaveProperty("registryAddress");
    expect(info).toHaveProperty("chainId");
    expect(info).toHaveProperty("roleCounts");
    expect(info.roleCounts).toHaveProperty("communityAdmin");
    expect(info.roleCounts).toHaveProperty("spo");
    expect(info.roleCounts).toHaveProperty("v4Operator");
    expect(info.roleCounts).toHaveProperty("endUser");
  });

  it("should return role IDs", () => {
    const roleIds = service.getRoleIds();
    expect(roleIds).toHaveProperty("DEFAULT_ADMIN_ROLE");
    expect(roleIds).toHaveProperty("ROLE_COMMUNITY");
    expect(roleIds).toHaveProperty("ROLE_PAYMASTER_AOA");
    expect(roleIds).toHaveProperty("ROLE_PAYMASTER_SUPER");
    expect(roleIds).toHaveProperty("ROLE_ENDUSER");
  });
});

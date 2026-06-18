import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { OperatorService } from "./operator.service";

jest.mock("@aastar/sdk/core", () => ({
  registryActions: jest.fn(() =>
    jest.fn(() => ({
      hasRole: jest.fn().mockResolvedValue(false),
      getRoleMembers: jest.fn().mockResolvedValue(["0xop1"]),
    }))
  ),
  stakingActions: jest.fn(() =>
    jest.fn(() => ({
      getStakeInfo: jest
        .fn()
        .mockResolvedValue({ amount: BigInt("30000000000000000000"), lockedUntil: BigInt(0) }),
    }))
  ),
  superPaymasterActions: jest.fn(() => jest.fn(() => ({}))),
  tokenActions: jest.fn(() =>
    jest.fn(() => ({
      balanceOf: jest.fn().mockResolvedValue(BigInt("10000000000000000000")),
    }))
  ),
  applyConfig: jest.fn(),
  CHAIN_SEPOLIA: 11155111,
  REGISTRY_ADDRESS: "0xregistry",
  GTOKEN_ADDRESS: "0xgtoken",
  GTOKEN_STAKING_ADDRESS: "0xstaking",
  SUPER_PAYMASTER_ADDRESS: "0xsuperpaymaster",
  PAYMASTER_FACTORY_ADDRESS: "0xfactory",
  ROLE_PAYMASTER_AOA: "0xaoa",
  ROLE_PAYMASTER_SUPER: "0xsuper",
}));

const mockReadContract = jest.fn().mockResolvedValue([
  BigInt("1000000000000000000"), // balance
  BigInt("1000"), // exchangeRate
  true, // isConfigured
  false, // isPaused
  "0xtoken", // token
  100, // reputation
  "0xtreasury", // treasury
  BigInt(0), // spent
  BigInt(100), // txSponsored
]);

const mockGetBalance = jest.fn().mockResolvedValue(BigInt("500000000000000000")); // 0.5 ETH

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({
    readContract: mockReadContract,
    getBalance: mockGetBalance,
  })),
  http: jest.fn(),
  formatUnits: jest.fn((val: bigint) => (Number(val) / 1e18).toString()),
  parseAbi: jest.fn(() => []),
}));

jest.mock("viem/chains", () => ({
  sepolia: { id: 11155111 },
}));

describe("OperatorService", () => {
  let service: OperatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("http://localhost:8545"),
          },
        },
      ],
    }).compile();

    service = module.get<OperatorService>(OperatorService);
    service.onModuleInit();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("getOperatorRoles returns isSPO and isV4Operator", async () => {
    const roles = await service.getOperatorRoles("0xaddr" as any);
    expect(roles).toHaveProperty("isSPO");
    expect(roles).toHaveProperty("isV4Operator");
  });

  it("getAllSPOOperators returns array", async () => {
    const ops = await service.getAllSPOOperators();
    expect(Array.isArray(ops)).toBe(true);
  });

  it("getAllV4Operators returns array", async () => {
    const ops = await service.getAllV4Operators();
    expect(Array.isArray(ops)).toBe(true);
  });

  it("getContractAddresses returns all required keys", () => {
    const addrs = service.getContractAddresses();
    expect(addrs).toHaveProperty("registryAddress");
    expect(addrs).toHaveProperty("gtokenAddress");
    expect(addrs).toHaveProperty("stakingAddress");
    expect(addrs).toHaveProperty("superPaymasterAddress");
    expect(addrs).toHaveProperty("paymasterFactoryAddress");
    expect(addrs).toHaveProperty("roleSPO");
    expect(addrs).toHaveProperty("roleV4");
  });
});

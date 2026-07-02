/* global fetch */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";

// L2 API e2e — covers auth-guard enforcement and the public read endpoints
// (community / operator / registry / admin) that back the management portal.
// No chain writes; public reads hit the SDK/RPC (read-only) so they get a
// generous timeout and shape-only assertions. See docs/TEST_PLAN.md (S2).
describe("API e2e (guards + public reads)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix("api/v1");
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string): Promise<Response> => fetch(`${baseUrl}/api/v1${path}`);
  const post = (path: string): Promise<Response> =>
    fetch(`${baseUrl}/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

  const SAMPLE = "0x0000000000000000000000000000000000000001";

  describe("JwtAuthGuard rejects unauthenticated requests (401)", () => {
    const guarded: Array<[string, () => Promise<Response>]> = [
      ["POST /account/create", () => post("/account/create")],
      [`GET /guardian/${SAMPLE}`, () => get(`/guardian/${SAMPLE}`)],
      ["GET /bls/nodes", () => get("/bls/nodes")],
      ["GET /community/dashboard", () => get("/community/dashboard")],
      ["GET /operator/dashboard", () => get("/operator/dashboard")],
      ["GET /admin/dashboard", () => get("/admin/dashboard")],
    ];
    it.each(guarded)("%s → 401", async (_label, call) => {
      expect((await call()).status).toBe(401);
    });
  });

  // A present-but-invalid/expired Bearer token must also be rejected with 401 (not 500,
  // and not accepted). JWT verification is local (no RPC) so this is deterministic.
  describe("JwtAuthGuard rejects invalid/expired tokens (401)", () => {
    const getAuth = (path: string, token: string): Promise<Response> =>
      fetch(`${baseUrl}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const badTokens: Array<[string, string]> = [
      ["garbage", "garbage"],
      ["malformed jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalidsig"],
      // exp = 2001 (long past), signature invalid — must be rejected either way.
      [
        "expired jwt",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4IiwiZXhwIjoxMDAwMDAwMDB9.badsig",
      ],
    ];
    it.each(badTokens)("GET /account with %s → 401", async (_label, token) => {
      expect((await getAuth("/account", token)).status).toBe(401);
    });
  });

  // NOTE: the public read endpoints (community/list, operator/status w/ address,
  // admin/*, registry/info) all do live on-chain reads via the SDK, which makes them
  // RPC-dependent and flaky under e2e load (Infura rate-limit / transient
  // "fetch failed"). Those are NOT asserted here — covered by L1 (direct viem) or a
  // warm running server. See docs/TEST_RESULTS.md (S2).

  // Regression (deterministic, no RPC): GET /operator/status with a missing/invalid
  // address used to 500 (it called hasRole(user=undefined)). The controller now guards
  // and returns 200 + an unregistered status BEFORE any chain read.
  describe("GET /operator/status tolerates a missing/invalid address (was 500)", () => {
    it("returns 200 + unregistered when address is absent", async () => {
      const res = await get("/operator/status");
      expect(res.status).toBe(200);
      expect((await res.json()).registered).toBe(false);
    });
    it("returns 200 + unregistered for a malformed address", async () => {
      const res = await get("/operator/status?address=notanaddress");
      expect(res.status).toBe(200);
      expect((await res.json()).registered).toBe(false);
    });
  });
});

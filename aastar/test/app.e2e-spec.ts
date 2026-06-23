/* global fetch */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";

// The canonical Sepolia PaymasterV4 (aPNTs gas token) from @aastar/sdk@0.26.x.
// Asserting it here guards against the stale 0x1f0D… address regression (PR #357).
const CANONICAL_PAYMASTER_V4 = "0x957852251f44570dc2B60Dde0954f191FF3372eE";

describe("App e2e (HTTP layer)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts so the test exercises the real prefix + validation pipeline.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix("api/v1");
    await app.listen(0); // ephemeral port
    baseUrl = await app.getUrl();
    // Sign with the app's own JwtService so the token matches what JwtStrategy verifies.
    token = app
      .get(JwtService, { strict: false })
      .sign({ sub: "e2e", email: "e2e@test.local", username: "e2e" });
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string, auth = false): Promise<Response> =>
    fetch(
      `${baseUrl}/api/v1${path}`,
      auth ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    );
  const post = (path: string, auth = false): Promise<Response> =>
    fetch(`${baseUrl}/api/v1${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
    });

  describe("JwtAuthGuard rejects unauthenticated requests", () => {
    it("GET /paymaster/presets without a token → 401", async () => {
      expect((await get("/paymaster/presets")).status).toBe(401);
    });
    it("POST /transfer/prepare without a token → 401", async () => {
      expect((await post("/transfer/prepare")).status).toBe(401);
    });
    it("POST /transfer/submit without a token → 401", async () => {
      expect((await post("/transfer/submit")).status).toBe(401);
    });
  });

  describe("paymaster presets are sourced from the SDK canonical table", () => {
    it("returns PaymasterV4 at the 0.26.x canonical Sepolia address", async () => {
      const res = await get("/paymaster/presets", true);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ name: string; address: string }>;
      expect(Array.isArray(body)).toBe(true);
      const v4 = body.find(p => /PaymasterV4/i.test(p.name));
      expect(v4).toBeDefined();
      expect(String(v4!.address).toLowerCase()).toBe(CANONICAL_PAYMASTER_V4.toLowerCase());
    });
  });
});

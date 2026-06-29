import { ExecutionContext } from "@nestjs/common";
import { OtpRateLimit, __resetOtpRateLimit } from "./otp-rate-limit.guard";

function ctx(email?: string, res?: { header: jest.Mock }): ExecutionContext {
  const body = email === undefined ? {} : { email };
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
      getResponse: () => res ?? { header: () => undefined },
    }),
  } as unknown as ExecutionContext;
}

describe("OtpRateLimit guard", () => {
  beforeEach(() => __resetOtpRateLimit());

  it("allows up to max hits, then throws 429", () => {
    const guard = new (OtpRateLimit("request", 3, 60_000))();
    for (let i = 0; i < 3; i++) {
      expect(guard.canActivate(ctx("a@x.io"))).toBe(true);
    }
    expect(() => guard.canActivate(ctx("a@x.io"))).toThrow(/Too many OTP request/);
  });

  it("counts each email independently", () => {
    const guard = new (OtpRateLimit("request", 1, 60_000))();
    expect(guard.canActivate(ctx("a@x.io"))).toBe(true);
    expect(guard.canActivate(ctx("b@x.io"))).toBe(true); // different email → own budget
    expect(() => guard.canActivate(ctx("a@x.io"))).toThrow();
  });

  it("normalizes email case + surrounding whitespace", () => {
    const guard = new (OtpRateLimit("request", 1, 60_000))();
    expect(guard.canActivate(ctx("A@X.io"))).toBe(true);
    expect(() => guard.canActivate(ctx("  a@x.io  "))).toThrow(); // same normalized key
  });

  it("keeps request and verify buckets separate", () => {
    const req = new (OtpRateLimit("request", 1, 60_000))();
    const ver = new (OtpRateLimit("verify", 1, 60_000))();
    expect(req.canActivate(ctx("a@x.io"))).toBe(true);
    expect(ver.canActivate(ctx("a@x.io"))).toBe(true); // separate bucket, not blocked
    expect(() => req.canActivate(ctx("a@x.io"))).toThrow();
  });

  it("never blocks (or tracks) bodies without a plausible email", () => {
    const guard = new (OtpRateLimit("request", 1, 60_000))();
    expect(guard.canActivate(ctx())).toBe(true);
    expect(guard.canActivate(ctx(""))).toBe(true);
    // Malformed email is not tracked → can be hit repeatedly (the DTO @IsEmail 400s it later).
    expect(guard.canActivate(ctx("notanemail"))).toBe(true);
    expect(guard.canActivate(ctx("notanemail"))).toBe(true);
  });

  it("frees the budget once the window slides past old hits", () => {
    let now = 1_000_000;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const guard = new (OtpRateLimit("request", 1, 1_000))();
      expect(guard.canActivate(ctx("a@x.io"))).toBe(true);
      expect(() => guard.canActivate(ctx("a@x.io"))).toThrow(); // within window
      now += 1_001; // slide past the window
      expect(guard.canActivate(ctx("a@x.io"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("sets a Retry-After header on the 429", () => {
    const header = jest.fn();
    const guard = new (OtpRateLimit("request", 1, 60_000))();
    expect(guard.canActivate(ctx("a@x.io", { header }))).toBe(true);
    expect(() => guard.canActivate(ctx("a@x.io", { header }))).toThrow();
    expect(header).toHaveBeenCalledWith("Retry-After", expect.stringMatching(/^\d+$/));
  });
});

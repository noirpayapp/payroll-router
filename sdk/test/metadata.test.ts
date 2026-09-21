import { describe, expect, it } from "vitest";
import { decodeMetadata, encodeMetadata, refFor } from "../src/metadata";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

describe("metadata", () => {
  it("encodes viewTag || selector || token || amount, with an optional ref", () => {
    const m = encodeMetadata(0x7a, USDG, 100_000_000n);
    expect(m).toBe(
      "0x7a23b872dd" + USDG.slice(2).toLowerCase() + "0000000000000000000000000000000000000000000000000000000005f5e100",
    );
    expect(m.length).toBe(2 + 114);
    const ref = refFor("invoice", "abc123");
    expect(encodeMetadata(1, USDG, 5n, ref).length).toBe(2 + 178);
  });

  it("round-trips", () => {
    const ref = refFor("payroll", "42:1700000000");
    expect(decodeMetadata(encodeMetadata(200, USDG, 123n, ref))).toEqual({
      viewTag: 200,
      token: USDG,
      amount: 123n,
      ref,
    });
    expect(decodeMetadata(encodeMetadata(0, USDG, 0n))).toEqual({ viewTag: 0, token: USDG, amount: 0n, ref: null });
  });

  it("returns null for other layouts and rejects bad inputs", () => {
    expect(decodeMetadata("0x")).toBeNull();
    expect(decodeMetadata("0x7a" + "a9059cbb" + USDG.slice(2) + "00".repeat(32))).toBeNull(); // transfer selector, not transferFrom
    expect(decodeMetadata("0x" + "zz".repeat(57))).toBeNull();
    expect(() => encodeMetadata(256, USDG, 1n)).toThrow(/byte/);
    expect(() => encodeMetadata(1, USDG, -1n)).toThrow(/range/);
    expect(() => encodeMetadata(1, USDG, 1n, "0x1234")).toThrow(/32 bytes/);
  });

  it("derives stable, domain-separated references", () => {
    expect(refFor("invoice", "abc")).toBe(refFor("invoice", "abc"));
    expect(refFor("invoice", "abc")).not.toBe(refFor("payroll", "abc"));
    expect(refFor("invoice", "abc")).not.toBe(refFor("invoice", "abc", { domain: "acme" }));
    expect(refFor("invoice", "abc")).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

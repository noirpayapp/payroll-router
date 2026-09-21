import { describe, expect, it } from "vitest";
import { decodeMetadata, refFor } from "../src/metadata";
import { buildBatch, buildPayment, buildPlainPayment, totalStipend } from "../src/payment";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const target = {
  stealthAddress: "0x00000000000000000000000000000000000000a1",
  ephemeralPub: ("0x02" + "11".repeat(32)) as `0x${string}`,
  viewTag: 0x7a,
} as const;
const plain = "0x00000000000000000000000000000000000000b2" as const;

describe("buildPayment", () => {
  it("matches the Payment struct and carries the stipend and ref", () => {
    const ref = refFor("invoice", "x");
    const p = buildPayment(target, USDG, 25_000_000n, { stipend: 30_000_000_000_000n, ref });
    expect(p).toEqual({
      stealthAddress: target.stealthAddress,
      amount: 25_000_000n,
      stipend: 30_000_000_000_000n,
      ephemeralPubKey: target.ephemeralPub,
      metadata: p.metadata,
    });
    expect(decodeMetadata(p.metadata)).toEqual({ viewTag: 0x7a, token: USDG, amount: 25_000_000n, ref });
  });

  it("builds a public leg with no stipend and no ephemeral key", () => {
    const p = buildPlainPayment(plain, USDG, 1n);
    expect(p).toMatchObject({ stealthAddress: plain, stipend: 0n, ephemeralPubKey: "0x" });
    expect(decodeMetadata(p.metadata)?.viewTag).toBe(0);
  });
});

describe("buildBatch", () => {
  it("mixes private and public lines, sums stipends into value and amounts into total", () => {
    const { payments, value, total } = buildBatch(
      [
        { target, amount: 250_000_000n, ref: refFor("payroll", "1") },
        { to: plain, amount: 75_000_000n },
        { target, amount: 1n },
      ],
      USDG,
      { stipend: 10n },
    );
    expect(payments).toHaveLength(3);
    expect(payments.map((p) => p.stipend)).toEqual([10n, 0n, 10n]);
    expect(value).toBe(20n);
    expect(totalStipend(payments)).toBe(value);
    expect(total).toBe(325_000_001n);
    expect(() => buildBatch([], USDG)).toThrow(/empty/);
  });
});

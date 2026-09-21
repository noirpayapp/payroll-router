import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex, type Log } from "viem";
import { describe, expect, it } from "vitest";
import { NoirpayRouterAbi } from "../src/abi";
import { encodeMetadata, refFor } from "../src/metadata";
import { parseAnnouncements, settlesInvoice, summarizeRun } from "../src/receipt";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ROUTER: Address = "0x1111111111111111111111111111111111111111";
const payer = getAddress("0x00000000000000000000000000000000000000e1");
const other = getAddress("0x00000000000000000000000000000000000000e2");
const eph = ("0x02" + "11".repeat(32)) as Hex;

/** A log exactly as a receipt would carry it: 3 indexed topics + ABI-encoded (bytes, bytes) data. */
function announcement(address: Address, caller: Address, stealth: Address, metadata: Hex, i: number): Log {
  return {
    address,
    topics: encodeEventTopics({
      abi: NoirpayRouterAbi,
      eventName: "Announcement",
      args: { schemeId: 1n, stealthAddress: stealth, caller },
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [eph, metadata]),
    blockNumber: 100n,
    blockHash: ("0x" + "ab".repeat(32)) as Hex,
    transactionHash: ("0x" + "cd".repeat(32)) as Hex,
    transactionIndex: 0,
    logIndex: i,
    removed: false,
  };
}

const s1 = getAddress("0x00000000000000000000000000000000000000a1");
const s2 = getAddress("0x00000000000000000000000000000000000000a2");
const s3 = getAddress("0x00000000000000000000000000000000000000a3");
const inv = refFor("invoice", "abc");
const logs: Log[] = [
  announcement(ROUTER, payer, s1, encodeMetadata(0x7a, USDG, 60_000_000n, inv), 0),
  announcement(ROUTER, payer, s2, encodeMetadata(0x11, USDG, 40_000_000n, inv), 1),
  announcement(ROUTER, other, s3, encodeMetadata(0x22, USDG, 5_000_000n), 2),
  announcement("0x2222222222222222222222222222222222222222", payer, s1, encodeMetadata(0x7a, USDG, 999n, inv), 3), // some other contract
  announcement(ROUTER, other, s3, "0xff" as Hex, 4), // foreign metadata shape
];

describe("parseAnnouncements", () => {
  it("decodes the router's announcements and skips other contracts", () => {
    const rows = parseAnnouncements(logs, ROUTER);
    expect(rows.map((r) => [r.stealth, r.caller, r.amount, r.ref])).toEqual([
      [s1, payer, 60_000_000n, inv],
      [s2, payer, 40_000_000n, inv],
      [s3, other, 5_000_000n, null],
      [s3, other, null, null],
    ]);
    expect(rows[0]).toMatchObject({ viewTag: 0x7a, token: USDG, ephemeralPub: eph, logIndex: 0, blockNumber: 100n });
    expect(rows[3]).toMatchObject({ viewTag: 0xff, token: null, metadata: "0xff" });
  });
});

describe("settlesInvoice", () => {
  const rows = parseAnnouncements(logs, ROUTER);
  it("sums every leg tagged with the invoice ref", () => {
    expect(settlesInvoice(rows, inv, 100_000_000n)).toEqual({ paid: 100_000_000n, ok: true });
    expect(settlesInvoice(rows, inv, 100_000_001n)).toEqual({ paid: 100_000_000n, ok: false });
    expect(settlesInvoice(rows, refFor("invoice", "zzz"), 1n)).toEqual({ paid: 0n, ok: false });
    expect(settlesInvoice(rows, inv, 1n, "0x0000000000000000000000000000000000000001")).toEqual({
      paid: 0n,
      ok: false,
    });
  });
});

describe("summarizeRun", () => {
  it("counts and totals what one wallet paid", () => {
    const rows = parseAnnouncements(logs, ROUTER);
    expect(summarizeRun(rows, payer)).toMatchObject({ lines: 2, total: 100_000_000n });
    expect(summarizeRun(rows, other)).toMatchObject({ lines: 2, total: 5_000_000n });
    expect(summarizeRun(rows, "0x00000000000000000000000000000000000000e3")).toMatchObject({ lines: 0, total: 0n });
  });
});

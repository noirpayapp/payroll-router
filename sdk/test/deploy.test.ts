import { describe, expect, it } from "vitest";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import type { Address, Hex } from "viem";
import { ROUTER_CODE_HASH } from "../src/abi";
import { routerCodeHash, stripMetadata, verifyDeployment } from "../src/deploy";

// runtime code + CBOR metadata of `meta` bytes + its 2-byte length
const withMeta = (code: string, meta: string): Hex => {
  const m = meta.length / 2;
  return `0x${code}${meta}${m.toString(16).padStart(4, "0")}` as Hex;
};
const CODE = "6080604052deadbeef";
const hash = `0x${bytesToHex(keccak_256(Uint8Array.from(Buffer.from(CODE, "hex"))))}` as Hex;
const A = "0x00000000000000000000000000000000000000a1" as Address;

describe("router deployment checks", () => {
  it("ignores the metadata tail, so two builds of the same source match", () => {
    expect(bytesToHex(stripMetadata(withMeta(CODE, "a264697066735822")))).toBe(CODE);
    expect(routerCodeHash(withMeta(CODE, "a2646970"))).toBe(routerCodeHash(withMeta(CODE, "a264697066735822aabb")));
    expect(ROUTER_CODE_HASH).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("accepts the right code by address or by deployment tx", async () => {
    const client = {
      getCode: async () => withMeta(CODE, "a26469"),
      getTransactionReceipt: async () => ({ status: "success", contractAddress: A, blockNumber: 42n }),
    };
    expect(await verifyDeployment(client, { address: A }, hash)).toEqual({ ok: true, address: A, block: undefined });
    expect(await verifyDeployment(client, { txHash: "0x01" }, hash)).toEqual({ ok: true, address: A, block: 42n });
  });

  it("says why it refuses", async () => {
    const base = { getCode: async () => withMeta("6080aa", "a26469") as Hex };
    expect(await verifyDeployment(base, { address: A }, hash)).toMatchObject({ ok: false, reason: "wrong-code" });
    expect(await verifyDeployment({ getCode: async () => "0x" as Hex }, { address: A }, hash)).toMatchObject({
      ok: false,
      reason: "no-code",
    });
    expect(
      await verifyDeployment(
        { ...base, getTransactionReceipt: async () => ({ status: "success", contractAddress: null, blockNumber: 1n }) },
        { txHash: "0x01" },
        hash,
      ),
    ).toMatchObject({ ok: false, reason: "not-a-deployment" });
    expect(
      await verifyDeployment(
        { ...base, getTransactionReceipt: async () => Promise.reject(new Error("x")) },
        { txHash: "0x01" },
        hash,
      ),
    ).toMatchObject({ ok: false, reason: "not-found" });
  });
});

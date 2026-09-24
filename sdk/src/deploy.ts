import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Address, Hex } from "viem";
import { ROUTER_CODE_HASH } from "./abi";

/** Runtime bytecode without its trailing CBOR metadata (the last two bytes give the metadata length). */
export function stripMetadata(code: Hex): Uint8Array {
  const b = hexToBytes(code.slice(2));
  if (b.length < 2) return b;
  const n = (b[b.length - 2]! << 8) | b[b.length - 1]!;
  return n + 2 <= b.length ? b.subarray(0, b.length - n - 2) : b;
}

/** keccak256 of the metadata-stripped runtime code — compare against ROUTER_CODE_HASH. */
export const routerCodeHash = (code: Hex): Hex => `0x${bytesToHex(keccak_256(stripMetadata(code)))}`;

type Client = {
  getCode: (a: { address: Address }) => Promise<Hex | undefined>;
  getTransactionReceipt?: (a: {
    hash: Hex;
  }) => Promise<{ status: string; contractAddress?: Address | null; blockNumber: bigint }>;
};

export type DeploymentCheck =
  | { ok: true; address: Address; block?: bigint }
  | { ok: false; reason: "not-found" | "not-a-deployment" | "no-code" | "wrong-code"; address?: Address };

/**
 * Is this address (or the contract a deployment tx created) a NoirpayRouter? The router has no owner and holds no
 * funds, so identical code means an identical router — safe to accept from anyone. Pass `expected` to pin a
 * different build.
 */
export async function verifyDeployment(
  client: Client,
  target: { address: Address } | { txHash: Hex },
  expected: Hex = ROUTER_CODE_HASH,
): Promise<DeploymentCheck> {
  let address: Address;
  let block: bigint | undefined;
  if ("txHash" in target) {
    if (!client.getTransactionReceipt) throw new Error("client.getTransactionReceipt is required to check a tx");
    const r = await client.getTransactionReceipt({ hash: target.txHash }).catch(() => null);
    if (!r) return { ok: false, reason: "not-found" };
    if (r.status !== "success" || !r.contractAddress) return { ok: false, reason: "not-a-deployment" };
    address = r.contractAddress;
    block = r.blockNumber;
  } else address = target.address;
  const code = await client.getCode({ address });
  if (!code || code === "0x") return { ok: false, reason: "no-code", address };
  if (routerCodeHash(code).toLowerCase() !== expected.toLowerCase())
    return { ok: false, reason: "wrong-code", address };
  return { ok: true, address, block };
}

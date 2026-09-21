import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import { getAddress, type Address, type Hex } from "viem";

/**
 * Announcement metadata, as the router emits it:
 *
 *   viewTag (1) || 0x23b872dd (4) || token (20) || amount (32) [|| ref (32)]
 *
 * The first byte is the ERC-5564 view tag. The next four are the `transferFrom` selector, which ERC-5564 suggests as a
 * hint that the payment was an ERC-20 transfer; then the token and the amount. The optional trailing 32 bytes tag the
 * payment with an invoice or payroll reference the payee can match without seeing anything else.
 */
export const TRANSFER_FROM_SELECTOR = "23b872dd";

export type DecodedMetadata = { viewTag: number; token: Address; amount: bigint; ref: Hex | null };

const strip = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);

export function encodeMetadata(viewTag: number, token: Address, amount: bigint, ref?: Hex): Hex {
  if (!Number.isInteger(viewTag) || viewTag < 0 || viewTag > 255) throw new Error("viewTag must be a byte");
  if (amount < 0n || amount >= 1n << 256n) throw new Error("amount out of range");
  if (ref !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(ref)) throw new Error("ref must be 32 bytes");
  const tag = viewTag.toString(16).padStart(2, "0");
  const amt = amount.toString(16).padStart(64, "0");
  return ("0x" +
    tag +
    TRANSFER_FROM_SELECTOR +
    strip(token).toLowerCase() +
    amt +
    (ref ? strip(ref).toLowerCase() : "")) as Hex;
}

/** null for anything that isn't this layout (other ERC-5564 senders may announce other shapes). */
export function decodeMetadata(metadata: string): DecodedMetadata | null {
  const h = strip(metadata);
  if ((h.length !== 114 && h.length !== 178) || !/^[0-9a-fA-F]*$/.test(h)) return null;
  if (h.slice(2, 10).toLowerCase() !== TRANSFER_FROM_SELECTOR) return null;
  return {
    viewTag: parseInt(h.slice(0, 2), 16),
    token: getAddress("0x" + h.slice(10, 50)),
    amount: BigInt("0x" + h.slice(50, 114)),
    ref: h.length === 178 ? (("0x" + h.slice(114).toLowerCase()) as Hex) : null,
  };
}

/**
 * A 32-byte reference for an invoice or a payroll line: keccak(`${domain}/${kind}/${id}`). Unguessable only if `id` is.
 * `domain` and `kind` may not contain "/", otherwise ("invoice/a", "b") and ("invoice", "a/b") would collide.
 */
export function refFor(kind: string, id: string, opts: { domain?: string } = {}): Hex {
  const domain = opts.domain ?? "noirpay";
  if (!kind || kind.includes("/")) throw new Error('kind must be non-empty and must not contain "/"');
  if (!domain || domain.includes("/")) throw new Error('domain must be non-empty and must not contain "/"');
  return ("0x" + bytesToHex(keccak_256(new TextEncoder().encode(`${domain}/${kind}/${id}`)))) as Hex;
}

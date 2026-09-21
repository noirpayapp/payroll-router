import type { Address, Hex } from "viem";
import { encodeMetadata } from "./metadata";

/** What `@noirpay/stealth-handles`' `generateStealthAddress` returns; any object of this shape works. */
export type StealthTargetLike = { stealthAddress: Address; ephemeralPub: Hex; viewTag: number };

/** One `Payment` struct, exactly as `pay` / `payBatch` take it. */
export type Payment = { stealthAddress: Address; amount: bigint; stipend: bigint; ephemeralPubKey: Hex; metadata: Hex };

/** A private payment: tokens to a one-time address, a gas stipend, and an announcement the recipient can recognise. */
export function buildPayment(
  target: StealthTargetLike,
  token: Address,
  amount: bigint,
  opts: { stipend?: bigint; ref?: Hex } = {},
): Payment {
  return {
    stealthAddress: target.stealthAddress,
    amount,
    stipend: opts.stipend ?? 0n,
    ephemeralPubKey: target.ephemeralPub,
    metadata: encodeMetadata(target.viewTag, token, amount, opts.ref),
  };
}

/**
 * A public leg in the same batch: someone without stealth keys, paid to their plain address. No stipend, no ephemeral
 * key, view tag 0. The router still emits an announcement; it is harmless because nobody can claim it.
 */
export function buildPlainPayment(to: Address, token: Address, amount: bigint, opts: { ref?: Hex } = {}): Payment {
  return {
    stealthAddress: to,
    amount,
    stipend: 0n,
    ephemeralPubKey: "0x",
    metadata: encodeMetadata(0, token, amount, opts.ref),
  };
}

export type BatchLine = { amount: bigint; ref?: Hex } & (
  { target: StealthTargetLike; to?: undefined } | { to: Address; target?: undefined }
);

/** A payroll run: one `payBatch` call. `value` is the ETH to send with it (the sum of stipends), which the router checks. */
export function buildBatch(
  lines: readonly BatchLine[],
  token: Address,
  opts: { stipend?: bigint } = {},
): { payments: Payment[]; value: bigint; total: bigint } {
  if (!lines.length) throw new Error("empty batch");
  const payments = lines.map((l) =>
    l.target
      ? buildPayment(l.target, token, l.amount, { stipend: opts.stipend, ref: l.ref })
      : buildPlainPayment(l.to, token, l.amount, { ref: l.ref }),
  );
  return { payments, value: totalStipend(payments), total: payments.reduce((s, p) => s + p.amount, 0n) };
}

export const totalStipend = (payments: readonly Payment[]): bigint => payments.reduce((s, p) => s + p.stipend, 0n);

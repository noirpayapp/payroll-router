import { parseEventLogs, type Address, type Hex, type Log } from "viem";
import { NoirpayRouterAbi } from "./abi";
import { decodeMetadata } from "./metadata";

/** One router announcement, decoded. `token` / `amount` / `ref` are null when the metadata isn't ours. */
export type AnnouncementRow = {
  stealth: Address;
  caller: Address;
  ephemeralPub: Hex;
  viewTag: number;
  token: Address | null;
  amount: bigint | null;
  ref: Hex | null;
  metadata: Hex;
  txHash: Hex | null;
  logIndex: number | null;
  blockNumber: bigint | null;
};

/** Pull the router's `Announcement` events out of receipt (or `eth_getLogs`) logs. Logs from other addresses are ignored. */
export function parseAnnouncements(logs: readonly Log[], router: Address): AnnouncementRow[] {
  const r = router.toLowerCase();
  const ours = logs.filter((l) => l.address.toLowerCase() === r);
  return parseEventLogs({ abi: NoirpayRouterAbi, eventName: "Announcement", strict: true, logs: ours }).map((l) => {
    const meta = decodeMetadata(l.args.metadata);
    const rawTag = l.args.metadata.length >= 4 ? parseInt(l.args.metadata.slice(2, 4), 16) : 0;
    return {
      stealth: l.args.stealthAddress,
      caller: l.args.caller,
      ephemeralPub: l.args.ephemeralPubKey,
      viewTag: meta?.viewTag ?? rawTag,
      token: meta?.token ?? null,
      amount: meta?.amount ?? null,
      ref: meta?.ref ?? null,
      metadata: l.args.metadata,
      txHash: l.transactionHash,
      logIndex: l.logIndex,
      blockNumber: l.blockNumber,
    };
  });
}

/** Does this set of announcements settle an invoice? Sums every row tagged with `ref` (in `token`, if given) and compares. */
export function settlesInvoice(
  rows: readonly AnnouncementRow[],
  ref: Hex,
  amount: bigint,
  token?: Address,
): { paid: bigint; ok: boolean } {
  const r = ref.toLowerCase();
  const t = token?.toLowerCase();
  const paid = rows
    .filter((x) => x.ref?.toLowerCase() === r && (!t || x.token?.toLowerCase() === t))
    .reduce((s, x) => s + (x.amount ?? 0n), 0n);
  return { paid, ok: paid >= amount };
}

/** What one wallet paid in a transaction: its announcements, their count and total. Used to record a payroll run. */
export function summarizeRun(
  rows: readonly AnnouncementRow[],
  caller: Address,
  token?: Address,
): { rows: AnnouncementRow[]; lines: number; total: bigint } {
  const c = caller.toLowerCase();
  const t = token?.toLowerCase();
  const mine = rows.filter((x) => x.caller.toLowerCase() === c && (!t || x.token?.toLowerCase() === t));
  return { rows: mine, lines: mine.length, total: mine.reduce((s, x) => s + (x.amount ?? 0n), 0n) };
}

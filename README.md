# payroll-router

`NoirpayRouter`: one contract that turns an ERC-20 transfer into a **stealth payment** (ERC-5564) with a **gas stipend**,
and pays a **whole payroll roster in one transaction**. Plus a TypeScript SDK (`sdk/`) to build the calls, tag invoices and
payroll lines, and verify settlement from a receipt. This is the payment rail behind [Noirpay](https://noirpay.app) on
Robinhood Chain (chain id 4663); it works on any EVM chain.

The router **holds no funds and has no owner**. Every payment is `transferFrom(msg.sender → stealthAddress)`, so the payer
approves the router once and keeps custody until the moment of payment.

## Contract

```solidity
struct Payment {
    address stealthAddress;   // one-time address derived from the recipient's meta-address
    uint256 amount;           // token units (may be 0 for a pure announcement + stipend)
    uint256 stipend;          // wei of ETH forwarded so the stealth address can pay gas later
    bytes   ephemeralPubKey;  // 33-byte compressed secp256k1
    bytes   metadata;         // viewTag (1) || 0x23b872dd (4) || token (20) || amount (32) [|| ref (32)]
}

function pay(address token, Payment calldata p) external payable;          // msg.value == p.stipend
function payBatch(address token, Payment[] calldata ps) external payable;  // msg.value == Σ stipend
function announce(address stealthAddress, bytes calldata ephemeralPubKey, bytes calldata metadata) external;

event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata);
```

- `pay` — transfer + stipend + `Announcement` (scheme id 1). Reverts on a stipend mismatch, a zero recipient, or a recipient
  that rejects ETH.
- `payBatch` — the same for a roster, atomically: either everyone is paid or nobody is. Lines for people without stealth keys
  can ride in the same batch as plain transfers (empty ephemeral key, no stipend).
- `announce` — emit only. For a payment that was settled with a plain `transfer` (for example from a stealth address that
  is spending), so the recipient can still find it.

The trailing 32-byte `ref` in `metadata` lets a payee recognise *which* invoice or payroll line a payment settles, without
the chain learning anything beyond an opaque hash.

### Build, test, deploy

```sh
forge install          # pinned: forge-std v1.16.2, openzeppelin-contracts v5.7.0
forge test
cp .env.example .env   # ROBINHOOD_RPC_URL, DEPLOYER_PRIVATE_KEY
forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC_URL --broadcast
```

The script writes `deployments/<chainId>.json`. On Arbitrum-based chains `block.number` inside Solidity is the L1 block, so
the L2 deployment block is read from `broadcast/Deploy.s.sol/<chainId>/run-latest.json` (`receipts[0].blockNumber`) instead.

## SDK — `@noirpay/payroll-router`

```sh
cd sdk && pnpm install && pnpm test
```

```ts
import { buildPayment, buildBatch, refFor, NoirpayRouterAbi, parseAnnouncements, settlesInvoice, summarizeRun } from "@noirpay/payroll-router";
import { generateStealthAddress } from "@noirpay/stealth-handles";

// one private payment, tagged with an invoice
const target = generateStealthAddress(payeeMetaAddress);
const p = buildPayment(target, USDG, 25_000_000n, { stipend: 30_000_000_000_000n, ref: refFor("invoice", invoiceId) });
await wallet.writeContract({ address: ROUTER, abi: NoirpayRouterAbi, functionName: "pay", args: [USDG, p], value: p.stipend });

// payroll: one transaction for the roster
const { payments, value } = buildBatch(
  roster.map((r) => (r.metaAddress ? { target: generateStealthAddress(r.metaAddress), amount: r.amount, ref: refFor("payroll", r.id) } : { to: r.wallet, amount: r.amount })),
  USDG,
  { stipend: 30_000_000_000_000n },
);
await wallet.writeContract({ address: ROUTER, abi: NoirpayRouterAbi, functionName: "payBatch", args: [USDG, payments], value });

// verify from the receipt (server side: never trust the client's word for "paid")
const rows = parseAnnouncements(receipt.logs, ROUTER);
settlesInvoice(rows, refFor("invoice", invoiceId), 25_000_000n); // { paid, ok }
summarizeRun(rows, employerWallet);                               // { lines, total }
```

| Export | Purpose |
|---|---|
| `NoirpayRouterAbi` | Generated from the Foundry artifact (`pnpm gen-abi`; CI checks it is current) |
| `encodeMetadata` / `decodeMetadata` / `refFor` | The announcement metadata layout and 32-byte references |
| `buildPayment` / `buildPlainPayment` / `buildBatch` / `totalStipend` | `Payment` structs and the ETH value to send |
| `parseAnnouncements` / `settlesInvoice` / `summarizeRun` | Receipt → rows → did it settle this invoice / what did this wallet pay |
| `verifyDeployment(client, { address } \| { txHash })` / `ROUTER_CODE_HASH` | Is this a NoirpayRouter? Compares metadata-stripped runtime code |

### Accept a router someone else deployed

The router has no owner and holds no funds, so any deployment of this exact code is as good as any other. An app can let
an operator deploy it from their own wallet and accept it after checking the code:

```ts
import { verifyDeployment } from "@noirpay/payroll-router";

const check = await verifyDeployment(publicClient, { txHash }); // or { address }
if (!check.ok) throw new Error(check.reason); // "not-found" | "not-a-deployment" | "no-code" | "wrong-code"
// check.address, check.block → start indexing announcements there
```

The hash ignores the CBOR metadata at the end of the bytecode, so builds of the same source from different checkouts
(different file paths, same solc 0.8.30 / optimizer 800 / cancun) all match.

The SDK has no dependency on the stealth maths; pass it any `{ stealthAddress, ephemeralPub, viewTag }`
(`@noirpay/stealth-handles` produces exactly that).

## Security notes

- The router is a thin, ownerless forwarder. The trust boundary is the token (`safeTransferFrom`) and the payer's approval.
- Stipends are plain ETH `call`s; a recipient that rejects ETH makes the whole payment (or batch) revert by design.
- `announce` is unauthenticated on purpose: anyone can emit any announcement. Announcements are hints for scanning, not
  proof of payment; verify balances or receipts (`parseAnnouncements` + `settlesInvoice`) before marking anything paid.
- Not audited.

MIT © Noirpay

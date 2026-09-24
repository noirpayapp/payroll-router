export { NoirpayRouterAbi, ROUTER_CODE_HASH } from "./abi";
export { routerCodeHash, stripMetadata, verifyDeployment, type DeploymentCheck } from "./deploy";
export { TRANSFER_FROM_SELECTOR, decodeMetadata, encodeMetadata, refFor, type DecodedMetadata } from "./metadata";
export {
  buildBatch,
  buildPayment,
  buildPlainPayment,
  totalStipend,
  type BatchLine,
  type Payment,
  type StealthTargetLike,
} from "./payment";
export { parseAnnouncements, settlesInvoice, summarizeRun, type AnnouncementRow } from "./receipt";

/** ERC-5564 scheme id the router announces under (secp256k1 + view tags). */
export const SCHEME_ID = 1n;

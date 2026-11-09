import {
  reconcileV3SquareLinkHistoryReadOnly
} from "./reconcileV3SquareLinkHistoryReadOnly.js";

const blocked = (orderId, reason) => Object.freeze({
  orderId,
  environment: "sandbox",
  complete: false,
  reason,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Adapts existing read-only Square link reconciliation.
 * Dependencies must be constructed by trusted server code.
 *
 * No negative history result authorizes payment.
 */
export function createV3SandboxLinkEvidenceReader({
  historyReader,
  ordersClient
} = {}) {
  return async function readPaymentLinks({ orderId } = {}) {
    const id = String(orderId || "").toLowerCase();

    if (!/^[a-f0-9]{24}$/.test(id)) {
      return blocked(id, "INVALID_ORDER_ID");
    }

    if (
      typeof historyReader?.collectHistory !== "function" ||
      typeof ordersClient?.get !== "function"
    ) {
      return blocked(id, "TRUSTED_SQUARE_READERS_REQUIRED");
    }

    let evidence;

    try {
      evidence = await reconcileV3SquareLinkHistoryReadOnly({
        orderId: id,
        historyReader,
        ordersClient
      });
    } catch {
      return blocked(id, "SQUARE_RECONCILIATION_FAILED");
    }

    return Object.freeze({
      orderId: id,
      environment: "sandbox",
      complete: evidence?.complete === true,
      reason: evidence?.reason || "UNKNOWN_SQUARE_HISTORY",
      priorActivityFound: evidence?.priorActivityFound === true,
      matchedLinkIds: Object.freeze([
        ...(evidence?.matchedLinkIds || [])
      ]),
      authoritativeNoPriorActivity: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  };
}
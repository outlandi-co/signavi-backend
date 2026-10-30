/**
 * Server-owned production identity contract.
 * Does not authorize, claim, release, or execute payments.
 *
 * These values must be reconciled against persisted order
 * and Square evidence before any future checkout activation.
 */

const ORDER_ID = /^[a-f0-9]{24}$/

export function resolveV3ProductionCheckoutIdentity({
  orderId
} = {}) {
  if (
    typeof orderId !== "string" ||
    !ORDER_ID.test(orderId)
  ) {
    throw new Error("INVALID_PRODUCTION_ORDER_ID")
  }

  return Object.freeze({
    orderId,
    purchaseKey:
      `signavi-v3-production-purchase-${orderId}`,
    squareOrderReferenceId:
      `SV3-${orderId}`,
    environment: "production"
  })
}
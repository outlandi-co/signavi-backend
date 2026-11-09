import {
  assessV3SandboxInitialization
} from "./assessV3SandboxInitialization.js";

const blocked = reason => Object.freeze({
  ready: false,
  reason,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Pure server-side preflight contract.
 *
 * Evidence must come from trusted backend verification,
 * not from a browser payload.
 *
 * Passing preflight does NOT authorize DB writes,
 * checkout execution, or Square requests.
 */
export function assessV3SandboxInitializationReadiness({
  storefrontDatabase,
  sandboxDatabase,
  storefrontOrder,
  storefrontOperation,
  sandboxOrder,
  sandboxOperation,
  guestOwnershipVerified,
  signedShippingVerified,
  invoiceAssociationsClear,
  paymentHistoryClear
} = {}) {
  if (
    storefrontDatabase !== "signavi_store" ||
    sandboxDatabase !== "signavi_shipping_v3_dev"
  ) {
    return blocked("DATABASE_ISOLATION_REQUIRED");
  }

  if (guestOwnershipVerified !== true) {
    return blocked("GUEST_OWNERSHIP_NOT_VERIFIED");
  }

  if (
    !signedShippingVerified ||
    signedShippingVerified.verified !== true
  ) {
    return blocked("SIGNED_SHIPPING_NOT_VERIFIED");
  }

  const candidate = assessV3SandboxInitialization({
    storefrontOrder,
    storefrontOperation,
    sandboxOrder,
    sandboxOperation
  });

  if (candidate.eligible !== true) {
    return blocked(candidate.reason);
  }

  if (
    String(signedShippingVerified.orderId).toLowerCase() !==
      candidate.orderId ||
    !Number.isSafeInteger(
      signedShippingVerified.shippingAmountCents
    ) ||
    signedShippingVerified.shippingAmountCents <= 0 ||
    signedShippingVerified.shippingAmountCents >
      candidate.amountCents
  ) {
    return blocked("SHIPPING_BINDING_MISMATCH");
  }

  if (invoiceAssociationsClear !== true) {
    return blocked("INVOICE_ASSOCIATIONS_NOT_CLEARED");
  }

  if (paymentHistoryClear !== true) {
    return blocked("PAYMENT_HISTORY_NOT_CLEARED");
  }

  return Object.freeze({
    ready: true,
    reason: "INITIALIZATION_PREFLIGHT_VERIFIED_ONLY",
    orderId: candidate.orderId,
    amountCents: candidate.amountCents,
    checkoutReferenceId: candidate.checkoutReferenceId,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
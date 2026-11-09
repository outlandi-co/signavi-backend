import mongoose from "mongoose";

import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js";

import {
  assessV3SandboxInitialization
} from "./assessV3SandboxInitialization.js";

import {
  checkV3CrossDatabaseInvoiceAssociations
} from "./checkV3CrossDatabaseInvoiceAssociations.js";

const blocked = reason => Object.freeze({
  verified: false,
  reason,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Internal, read-only initialization preflight.
 *
 * This module does not grant database write access.
 * Square history must be independently established by
 * trusted server-side code, never by a browser request.
 */
export async function verifyV3SandboxInitializationEvidence({
  storefrontOrder,
  storefrontOperation,
  sandboxOrder = null,
  sandboxOperation = null,
  guestToken,
  signedQuote,
  storefrontConnection,
  sandboxConnection
} = {}) {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    return blocked("SANDBOX_ENVIRONMENT_REQUIRED");
  }

  if (
    !storefrontOrder ||
    !storefrontOperation ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    return blocked("CHECKOUT_CREDENTIALS_OR_RECORDS_MISSING");
  }

  if (
    storefrontConnection !== mongoose.connection ||
    storefrontConnection?.readyState !== 1 ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    sandboxConnection === storefrontConnection ||
    sandboxConnection?.readyState !== 1 ||
    sandboxConnection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    return blocked("DATABASE_ISOLATION_REQUIRED");
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

  let prepared;

  try {
    prepared = prepareV3CheckoutPayment({
      order: storefrontOrder,
      guestToken,
      signedQuote
    });
  } catch {
    return blocked("SIGNED_CHECKOUT_VERIFICATION_FAILED");
  }

  if (
    !prepared ||
    String(prepared.orderId).toLowerCase() !== candidate.orderId ||
    prepared.totalCents !== candidate.amountCents
  ) {
    return blocked("SIGNED_CHECKOUT_AMOUNT_MISMATCH");
  }

  const invoices =
    await checkV3CrossDatabaseInvoiceAssociations({
      orderId: candidate.orderId,
      storefrontConnection,
      sandboxConnection
    });

  if (invoices.clear !== true) {
    return blocked(invoices.reason);
  }


  // No trusted server-owned external payment-history authority
  // has been connected. An empty local history is insufficient.
  // No callback, payment request, or initialization may proceed.
  return blocked("TRUSTED_PAYMENT_HISTORY_AUTHORITY_NOT_CONNECTED");
}
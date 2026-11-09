import {
  inspectV3CrossDatabaseEvidence
} from "./inspectV3CrossDatabaseEvidence.js";

import {
  checkV3CrossDatabaseInvoiceAssociations
} from "./checkV3CrossDatabaseInvoiceAssociations.js";

const blocked = reason => Object.freeze({
  ready: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

export async function inspectV3TrustedCheckoutReadiness({
  orderId,
  storefrontConnection,
  sandboxConnection,
  StorefrontOrder,
  SandboxOrder,
  SandboxPaymentOperation,
  verifiedShipping,
  checkPaymentHistory
} = {}) {
  if (typeof checkPaymentHistory !== "function") {
    return blocked("PAYMENT_HISTORY_CHECK_REQUIRED");
  }

  const evidence = await inspectV3CrossDatabaseEvidence({
    orderId,
    storefrontConnection,
    sandboxConnection,
    StorefrontOrder,
    SandboxOrder,
    SandboxPaymentOperation,
    verifiedShipping
  });

  if (evidence.verified !== true) {
    return blocked(evidence.reason);
  }

  const invoices =
    await checkV3CrossDatabaseInvoiceAssociations({
      orderId: evidence.orderId,
      storefrontConnection,
      sandboxConnection
    });

  if (invoices.clear !== true) {
    return blocked(invoices.reason);
  }

  let history;

  try {
    history = await checkPaymentHistory({
      orderId: evidence.orderId,
      amountCents: evidence.amountCents
    });
  } catch {
    return blocked("PAYMENT_HISTORY_READ_UNCERTAIN");
  }

  if (
    history?.verified !== true ||
    history?.noPriorPaymentActivity !== true
  ) {
    return blocked("PAYMENT_HISTORY_NOT_CLEARED");
  }

  // Even successful read-only checks cannot establish
  // transactional ownership or Square execution permission.
  return Object.freeze({
    ready: false,
    reason: "DURABLE_EXECUTION_BOUNDARY_REQUIRED",
    orderId: evidence.orderId,
    amountCents: evidence.amountCents,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
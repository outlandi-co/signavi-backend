import {
  verifyV3CrossDatabaseBinding
} from "./verifyV3CrossDatabaseBinding.js";

const blocked = reason => Object.freeze({
  verified: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

export async function inspectV3CrossDatabaseEvidence({
  orderId,
  storefrontConnection,
  sandboxConnection,
  StorefrontOrder,
  SandboxOrder,
  SandboxPaymentOperation,
  verifiedShipping
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (!/^[0-9a-f]{24}$/.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  if (
    storefrontConnection?.readyState !== 1 ||
    sandboxConnection?.readyState !== 1 ||
    storefrontConnection === sandboxConnection ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    sandboxConnection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    return blocked("DATABASE_CONNECTION_NOT_VERIFIED");
  }

  if (
    StorefrontOrder?.db !== storefrontConnection ||
    SandboxOrder?.db !== sandboxConnection ||
    SandboxPaymentOperation?.db !== sandboxConnection ||
    typeof StorefrontOrder.findById !== "function" ||
    typeof SandboxOrder.findById !== "function" ||
    typeof SandboxPaymentOperation.findOne !== "function"
  ) {
    return blocked("AUTHORITATIVE_MODELS_NOT_VERIFIED");
  }

  try {
    const [storefrontOrder, sandboxOrder, sandboxOperation] =
      await Promise.all([
        StorefrontOrder.findById(id).lean(),
        SandboxOrder.findById(id).lean(),
        SandboxPaymentOperation.findOne({
          orderId: id,
          environment: "sandbox"
        }).lean()
      ]);

    const binding = verifyV3CrossDatabaseBinding({
      storefrontDatabase: storefrontConnection.db.databaseName,
      sandboxDatabase: sandboxConnection.db.databaseName,
      storefrontOrder,
      sandboxOrder,
      sandboxOperation,
      verifiedShipping
    });

    if (binding.verified !== true) {
      return blocked(binding.reason);
    }

    // No invoice association, payment-history, concurrency,
    // or external Square clearance has been established.
    return Object.freeze({
      verified: true,
      orderId: binding.orderId,
      amountCents: binding.amountCents,
      reason: "AUTHORITATIVE_RECORDS_CONSISTENT_ONLY",
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  } catch {
    return blocked("CROSS_DATABASE_EVIDENCE_READ_UNCERTAIN");
  }
}
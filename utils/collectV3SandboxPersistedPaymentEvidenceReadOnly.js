import mongoose from "mongoose";

import {
  assessV3SandboxPersistedPaymentEvidence
} from "./assessV3SandboxPersistedPaymentEvidence.js";

const COLLECTION = "smart_shipping_v3_payment_operations";
const ID_PATTERN = /^[0-9a-f]{24}$/;

const blocked = reason => Object.freeze({
  eligibleForTrustedReview: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Read-only sandbox persisted-operation evidence.
 *
 * This does not establish Store ownership or authenticate
 * signed checkout credentials. The expected amount and owner
 * must originate from separately verified server-side data.
 *
 * Nothing returned here grants payment execution permission.
 */
export async function collectV3SandboxPersistedPaymentEvidenceReadOnly({
  orderId,
  expectedAmountCents,
  expectedOwner,
  sandboxConnection
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (
    process.env.NODE_ENV === "production" ||
    !["test", "development"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    return blocked("SANDBOX_ENVIRONMENT_REQUIRED");
  }

  if (!ID_PATTERN.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  if (
    !sandboxConnection ||
    sandboxConnection === mongoose.connection ||
    sandboxConnection.readyState !== 1 ||
    sandboxConnection.db?.databaseName !==
      "signavi_shipping_v3_dev"
  ) {
    return blocked("ISOLATED_SANDBOX_CONNECTION_REQUIRED");
  }

  if (
    !Number.isSafeInteger(expectedAmountCents) ||
    expectedAmountCents <= 0 ||
    typeof expectedOwner !== "string" ||
    !expectedOwner.trim()
  ) {
    return blocked("EXPECTED_SERVER_EVIDENCE_MISSING");
  }

  try {
    const collection = sandboxConnection.db.collection(COLLECTION);

    const operation = await collection.findOne({
      orderId: new mongoose.Types.ObjectId(id)
    });

    return assessV3SandboxPersistedPaymentEvidence({
      orderId: id,
      expectedAmountCents,
      expectedOwner,
      operation
    });
  } catch {
    return blocked("PERSISTED_PAYMENT_EVIDENCE_READ_FAILED");
  }
}

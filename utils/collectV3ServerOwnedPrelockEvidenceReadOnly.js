import mongoose from "mongoose";
import Order from "../models/Order.js";

import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js";

import {
  getV3SandboxConnection
} from "./v3SandboxDatabaseConnection.js";

import {
  assessV3SandboxCheckoutLifecycleReadOnly
} from "./assessV3SandboxCheckoutLifecycleReadOnly.js";

const OBJECT_ID = /^[0-9a-f]{24}$/;

function denied(reason) {
  return Object.freeze({
    eligibleForReview: false,
    stage: "blocked",
    reason,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}

/**
 * Server-owned, read-only PRE-LOCK evidence collection.
 *
 * Requires authenticated checkout credentials.
 *
 * Does not acquire a lock, reserve an operation,
 * construct a Square client, or grant execution authority.
 *
 * The operation snapshot is preliminary evidence only.
 * A final execution decision requires independent external
 * history and atomic durable ownership verification.
 */
export async function collectV3ServerOwnedPrelockEvidenceReadOnly({
  orderId,
  guestToken,
  signedQuote
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (
    !OBJECT_ID.test(id) ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    return denied("CHECKOUT_CREDENTIALS_REQUIRED");
  }

  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !==
      "false"
  ) {
    return denied("READ_ONLY_SANDBOX_ENVIRONMENT_REQUIRED");
  }

  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !== "signavi_store" ||
    Order.db !== mongoose.connection
  ) {
    return denied("STOREFRONT_AUTHORITY_REQUIRED");
  }

  try {
    // Authoritative Store order, not a caller-provided object.
    const storefrontOrder = await Order.findById(id);

    if (!storefrontOrder) {
      return denied("STOREFRONT_ORDER_NOT_FOUND");
    }

    // Existing signed-quote and shipping verification.
    const prepared = prepareV3CheckoutPayment({
      order: storefrontOrder,
      guestToken,
      signedQuote
    });

    if (
      !prepared ||
      String(prepared.orderId).toLowerCase() !== id ||
      !Number.isSafeInteger(prepared.totalCents) ||
      prepared.totalCents <= 0 ||
      storefrontOrder.squareExpectedAmountCents !==
        prepared.totalCents
    ) {
      return denied("SIGNED_STORE_CHECKOUT_NOT_VERIFIED");
    }

    const sandboxConnection =
      await getV3SandboxConnection();

    if (
      sandboxConnection === mongoose.connection ||
      sandboxConnection?.readyState !== 1 ||
      sandboxConnection.db?.databaseName !==
        "signavi_shipping_v3_dev"
    ) {
      return denied("SANDBOX_DATABASE_ISOLATION_REQUIRED");
    }

    const objectId = new mongoose.Types.ObjectId(id);

    // An existing lock requires separate ownership/recovery
    // assessment. Do not treat an old or expired lock as
    // permission to start another attempt.
    const existingLock = await sandboxConnection.db
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: objectId });

    if (existingLock) {
      return denied("EXISTING_CHECKOUT_LOCK_REQUIRES_REVIEW");
    }

    const operation = await sandboxConnection.db
      .collection("smart_shipping_v3_payment_operations")
      .findOne({ orderId: objectId });

    if (!operation) {
      return denied("PENDING_PAYMENT_OPERATION_NOT_FOUND");
    }

    const assessment =
      assessV3SandboxCheckoutLifecycleReadOnly({
        stage: "pre_lock",
        orderId: id,
        storefrontOrder,
        prepared,
        operation,
        acquiredLock: null,
        persistedLock: null
      });

    if (
      assessment.eligibleForReview !== true ||
      assessment.stage !== "pre_lock" ||
      assessment.squareRequestAuthorized !== false ||
      assessment.retryAuthorized !== false
    ) {
      return denied(
        assessment.reason || "PRELOCK_EVIDENCE_REJECTED"
      );
    }

    return Object.freeze({
      eligibleForReview: true,
      stage: "pre_lock",
      reason: "SERVER_OWNED_PRELOCK_EVIDENCE_CONSISTENT",
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  } catch {
    // Fail closed without exposing database or credential details.
    return denied("PRELOCK_EVIDENCE_READ_FAILED");
  }
}

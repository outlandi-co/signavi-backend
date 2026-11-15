import mongoose from "mongoose";
import Order from "../models/Order.js";

import {
  getV3SandboxConnection
} from "./v3SandboxDatabaseConnection.js";

import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js";

import {
  collectV3SandboxPersistedPaymentEvidenceReadOnly
} from "./collectV3SandboxPersistedPaymentEvidenceReadOnly.js";

const ID = /^[a-f0-9]{24}$/;

const denied = reason => Object.freeze({
  eligibleForTrustedReview: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Checks a server-read lock against a signed, verified
 * Store checkout. This is a preliminary consistency
 * assessment, not an authorization or lock acquisition.
 */
export function assessV3StoreSandboxOwnershipEvidence({
  orderId,
  storefrontOrder,
  prepared,
  lock,
  now = new Date()
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (!ID.test(id)) {
    return denied("INVALID_ORDER_ID");
  }

  if (
    !storefrontOrder ||
    String(storefrontOrder._id ?? "").toLowerCase() !== id
  ) {
    return denied("STOREFRONT_ORDER_MISMATCH");
  }

  if (
    !prepared ||
    String(prepared.orderId ?? "").toLowerCase() !== id ||
    !Number.isSafeInteger(prepared.totalCents) ||
    prepared.totalCents <= 0 ||
    storefrontOrder.squareExpectedAmountCents !==
      prepared.totalCents
  ) {
    return denied("VERIFIED_CHECKOUT_AMOUNT_MISMATCH");
  }

  if (
    !lock ||
    String(lock._id ?? "").toLowerCase() !== id ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    !(lock.expiresAt instanceof Date) ||
    !Number.isFinite(lock.expiresAt.getTime()) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    lock.expiresAt <= now
  ) {
    return denied("ACTIVE_CHECKOUT_LOCK_NOT_VERIFIED");
  }

  return Object.freeze({
    eligibleForTrustedReview: true,
    reason: "STORE_AND_LOCK_EVIDENCE_CONSISTENT",
    expectedAmountCents: prepared.totalCents,
    expectedOwner: lock.owner,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}

/**
 * Compare the current server-acquired lock with its persisted
 * database snapshot. Both must refer to the same attempt.
 *
 * This is a consistency check, not proof of caller authority.
 */
export function assessV3AcquiredCheckoutLockBinding({
  orderId,
  acquiredLock,
  persistedLock,
  now = new Date()
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  const validLock = lock =>
    lock &&
    String(lock.orderId ?? lock._id ?? "").toLowerCase() === id &&
    typeof lock.owner === "string" &&
    lock.owner.trim() &&
    lock.expiresAt instanceof Date &&
    Number.isFinite(lock.expiresAt.getTime()) &&
    lock.expiresAt > now;

  if (
    !ID.test(id) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !validLock(acquiredLock) ||
    !validLock(persistedLock)
  ) {
    return Object.freeze({
      bound: false,
      reason: "CURRENT_CHECKOUT_LOCK_NOT_VERIFIED"
    });
  }

  if (
    acquiredLock.owner !== persistedLock.owner ||
    acquiredLock.expiresAt.getTime() !==
      persistedLock.expiresAt.getTime()
  ) {
    return Object.freeze({
      bound: false,
      reason: "CHECKOUT_LOCK_ATTEMPT_MISMATCH"
    });
  }

  return Object.freeze({
    bound: true,
    reason: "CHECKOUT_LOCK_ATTEMPT_MATCHED",
    squareRequestAuthorized: false
  });
}
/**
 * Production-bound, server-only read-only coordinator.
 * No caller can inject an order, owner, amount, reader,
 * connection or approval through this function.
 *
 * The caller supplies only checkout credentials.
 * This does not grant permission to contact Square.
 */
export async function collectV3StoreSandboxOwnershipEvidenceReadOnly({
  orderId,
  guestToken,
  signedQuote,
  acquiredLock
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (
    !["test", "development"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    return denied("SANDBOX_ENVIRONMENT_REQUIRED");
  }

  if (
    !ID.test(id) ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    return denied("CHECKOUT_CREDENTIALS_REQUIRED");
  }

  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !== "signavi_store" ||
    Order.db !== mongoose.connection
  ) {
    return denied("STOREFRONT_AUTHORITY_REQUIRED");
  }

  try {
    const storefrontOrder = await Order.findById(id);

    if (!storefrontOrder) {
      return denied("STOREFRONT_ORDER_NOT_FOUND");
    }

    const prepared = prepareV3CheckoutPayment({
      order: storefrontOrder,
      guestToken,
      signedQuote
    });

    if (!prepared) {
      return denied("SIGNED_CHECKOUT_VERIFICATION_FAILED");
    }

    const sandboxConnection = await getV3SandboxConnection();

    if (
      sandboxConnection === mongoose.connection ||
      sandboxConnection?.readyState !== 1 ||
      sandboxConnection.db?.databaseName !==
        "signavi_shipping_v3_dev"
    ) {
      return denied("SANDBOX_DATABASE_ISOLATION_REQUIRED");
    }

    const lock = await sandboxConnection.db
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    const binding = assessV3AcquiredCheckoutLockBinding({
      orderId: id,
      acquiredLock,
      persistedLock: lock
    });

    if (binding.bound !== true) {
      return denied(binding.reason);
    }

    const ownership = assessV3StoreSandboxOwnershipEvidence({
      orderId: id,
      storefrontOrder,
      prepared,
      lock
    });

    if (ownership.eligibleForTrustedReview !== true) {
      return ownership;
    }

    const persisted =
      await collectV3SandboxPersistedPaymentEvidenceReadOnly({
        orderId: id,
        expectedAmountCents: ownership.expectedAmountCents,
        expectedOwner: ownership.expectedOwner,
        sandboxConnection
      });

    if (persisted.eligibleForTrustedReview !== true) {
      return denied(
        persisted.reason || "PERSISTED_EVIDENCE_NOT_ACCEPTED"
      );
    }

    return Object.freeze({
      eligibleForTrustedReview: true,
      reason: "STORE_SANDBOX_EVIDENCE_REVIEW_ELIGIBLE",
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  } catch {
    return denied("STORE_SANDBOX_EVIDENCE_READ_FAILED");
  }
}

import {
  assessV3SandboxReservationLifecycleStage
} from "./assessV3SandboxReservationLifecycleStage.js";

import {
  assessV3AcquiredCheckoutLockBinding,
  assessV3StoreSandboxOwnershipEvidence
} from "./collectV3StoreSandboxOwnershipEvidenceReadOnly.js";

const OBJECT_ID = /^[0-9a-f]{24}$/;

const deny = reason => Object.freeze({
  eligibleForReview: false,
  stage: "blocked",
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const review = (stage, reason) => Object.freeze({
  eligibleForReview: true,
  stage,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Pure, read-only lifecycle assessment.
 *
 * Does NOT establish provenance of caller-supplied records.
 * The authenticated Store checkout, database connections,
 * and server-acquired lock must be verified independently.
 *
 * Never use this result to authorize Square execution.
 */
export function assessV3SandboxCheckoutLifecycleReadOnly({
  stage,
  orderId,
  storefrontOrder,
  prepared,
  operation,
  acquiredLock = null,
  persistedLock = null,
  now = new Date()
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (!OBJECT_ID.test(id)) {
    return deny("INVALID_ORDER_ID");
  }

  if (
    !storefrontOrder ||
    String(storefrontOrder._id ?? "").toLowerCase() !== id ||
    !prepared ||
    String(prepared.orderId ?? "").toLowerCase() !== id ||
    !Number.isSafeInteger(prepared.totalCents) ||
    prepared.totalCents <= 0 ||
    !Number.isSafeInteger(
      storefrontOrder.squareExpectedAmountCents
    ) ||
    storefrontOrder.squareExpectedAmountCents !==
      prepared.totalCents
  ) {
    return deny("STORE_CHECKOUT_AMOUNT_NOT_VERIFIED");
  }

  if (
    ![
      "pre_lock",
      "lock_acquired",
      "post_reservation"
    ].includes(stage)
  ) {
    return deny("UNKNOWN_LIFECYCLE_STAGE");
  }

  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    return deny("INVALID_ASSESSMENT_TIME");
  }

  // Before lock acquisition, no caller lock is accepted.
  if (
    stage === "pre_lock" &&
    (acquiredLock !== null || persistedLock !== null)
  ) {
    return deny("PRELOCK_CANNOT_ASSERT_LOCK_OWNERSHIP");
  }

  let owner;

  if (stage !== "pre_lock") {
    const binding = assessV3AcquiredCheckoutLockBinding({
      orderId: id,
      acquiredLock,
      persistedLock,
      now
    });

    if (binding.bound !== true) {
      return deny(binding.reason);
    }

    const ownership = assessV3StoreSandboxOwnershipEvidence({
      orderId: id,
      storefrontOrder,
      prepared,
      lock: persistedLock,
      now
    });

    if (ownership.eligibleForTrustedReview !== true) {
      return deny(ownership.reason);
    }

    owner = acquiredLock.owner;

    if (ownership.expectedOwner !== owner) {
      return deny("CHECKOUT_ATTEMPT_OWNER_MISMATCH");
    }
  }

  const operationState =
    assessV3SandboxReservationLifecycleStage({
      orderId: id,
      amountCents: prepared.totalCents,
      expectedOwner: owner,
      operation
    });

  if (operationState.eligibleForReview !== true) {
    return deny(operationState.reason);
  }

  if (stage === "pre_lock") {
    if (operationState.stage !== "before_reservation") {
      return deny("PRELOCK_OPERATION_NOT_PENDING");
    }

    return review(
      "pre_lock",
      "PRELOCK_EVIDENCE_REVIEW_ELIGIBLE"
    );
  }

  if (stage === "lock_acquired") {
    if (operationState.stage !== "before_reservation") {
      return deny("PRERESERVATION_OPERATION_NOT_PENDING");
    }

    return review(
      "lock_acquired",
      "LOCKED_PENDING_OPERATION_REVIEW_ELIGIBLE"
    );
  }

  if (operationState.stage !== "after_reservation") {
    return deny("POSTRESERVATION_OPERATION_NOT_RESERVED");
  }

  return review(
    "post_reservation",
    "RESERVED_OPERATION_REQUIRES_EXTERNAL_HISTORY_REVIEW"
  );
}

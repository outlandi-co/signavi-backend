import {
  resolveV3ProductionPurchaseIdentity
} from "./resolveV3ProductionPurchaseIdentity.js"

/**
 * Test-only reservation prototype.
 *
 * No Square calls.
 * No payment creation.
 * No live production database access.
 *
 * Actual concurrency protection requires verified MongoDB
 * unique indexes, tested separately.
 */
export async function reserveV3ProductionPurchaseIsolated({
  documentType,
  documentId,
  orderId,
  loadOrder,
  loadAssociation,
  Reservation
}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (!Reservation || typeof Reservation.create !== "function") {
    throw new Error("TRUSTED_RESERVATION_REPOSITORY_REQUIRED")
  }

  const identity = await resolveV3ProductionPurchaseIdentity({
    documentType,
    documentId,
    orderId,
    loadOrder,
    loadAssociation
  })

  const reservationData = {
    environment: "production",
    orderId: identity.orderId,
    purchaseKey: identity.purchaseKey,
    claimedByDocumentType: identity.documentType,
    claimedByDocumentId: identity.documentId,
    status: "reserved",
    idempotencyKey: identity.purchaseKey,
    attemptClaimedAt: null
  }

  try {
    const record = await Reservation.create(reservationData)

    if (
      !record ||
      String(record.purchaseKey) !== identity.purchaseKey ||
      record.environment !== "production"
    ) {
      throw new Error("RESERVATION_RESULT_MISMATCH")
    }

    return Object.freeze({
      reserved: true,
      blocked: false,
      purchaseKey: identity.purchaseKey,
      documentType: identity.documentType,
      documentId: identity.documentId
    })
  } catch (error) {
    // MongoDB duplicate key. Do not retry or create a second
    // payment identity.
    if (error?.code === 11000) {
      return Object.freeze({
        reserved: false,
        blocked: true,
        reason: "PURCHASE_ALREADY_RESERVED",
        purchaseKey: identity.purchaseKey
      })
    }

    throw error
  }
}

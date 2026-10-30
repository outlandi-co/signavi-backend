const validId = value =>
  /^[0-9a-f]{24}$/.test(String(value || "").toLowerCase())

const blocked = reason => Object.freeze({
  prepared: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

const prepared = (orderId, purchaseKey, existed) =>
  Object.freeze({
    prepared: true,
    orderId,
    purchaseKey,
    existed,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })

function isUnclaimedPair(reservation, operation, id, key, cents) {
  return Boolean(
    reservation &&
    operation &&
    reservation.environment === "production" &&
    String(reservation.orderId).toLowerCase() === id &&
    reservation.purchaseKey === key &&
    reservation.idempotencyKey === key &&
    reservation.claimedByDocumentType === "order" &&
    String(reservation.claimedByDocumentId).toLowerCase() === id &&
    reservation.status === "reserved" &&
    !reservation.checkoutClaimOwner &&
    reservation.checkoutClaimAmountCents == null &&
    !reservation.attemptClaimedAt &&
    operation.environment === "production" &&
    String(operation.orderId).toLowerCase() === id &&
    operation.idempotencyKey === key &&
    operation.amountCents === cents &&
    operation.status === "pending" &&
    !operation.squareCreationAttemptClaimedAt &&
    !operation.requestOwner &&
    !operation.squareIdempotencyKey &&
    !operation.squarePaymentLinkId &&
    !operation.squareOrderId &&
    !operation.paymentUrl
  )
}

/**
 * Insert-only, transactional production purchase initialization.
 *
 * This is NOT an HTTP authorization or Square execution boundary.
 * The caller must independently verify:
 *   - authenticated checkout and order ownership
 *   - server-saved order total and payment eligibility
 *   - absence of unresolved legacy Square payment activity
 *
 * Existing claimed/uncertain payment state is never reset.
 */
export async function initializeV3ProductionCheckoutAtomic({
  Reservation,
  PaymentOperation,
  startSession,
  orderId,
  amountCents
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (
    !validId(id) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    return blocked("INVALID_PRODUCTION_CHECKOUT_INPUT")
  }

  if (
    typeof Reservation?.create !== "function" ||
    typeof Reservation?.findOne !== "function" ||
    typeof PaymentOperation?.create !== "function" ||
    typeof PaymentOperation?.findOne !== "function" ||
    typeof startSession !== "function"
  ) {
    return blocked("TRUSTED_REPOSITORIES_REQUIRED")
  }

  const purchaseKey =
    `signavi-v3-production-purchase-${id}`

  let session
  let committed = false
  let duplicate = false

  try {
    session = await startSession()

    await session.withTransaction(async () => {
      await Reservation.create([{
        environment: "production",
        orderId: id,
        purchaseKey,
        idempotencyKey: purchaseKey,
        claimedByDocumentType: "order",
        claimedByDocumentId: id,
        status: "reserved",
        checkoutClaimOwner: null,
        checkoutClaimAmountCents: null,
        attemptClaimedAt: null
      }], { session })

      await PaymentOperation.create([{
        environment: "production",
        orderId: id,
        idempotencyKey: purchaseKey,
        amountCents,
        status: "pending",
        squareCreationAttemptClaimedAt: null,
        requestOwner: "",
        squareIdempotencyKey: null,
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      }], { session })
    })

    committed = true
  } catch (error) {
    // A duplicate is never overwritten. It may represent an
    // already-prepared purchase or a payment in progress.
    duplicate = error?.code === 11000

    if (!duplicate) {
      return blocked("INITIALIZATION_OUTCOME_UNCERTAIN")
    }
  } finally {
    if (session) {
      await session.endSession()
    }
  }

  // Read back the actual persisted pair; transaction
  // acknowledgement or a duplicate alone is insufficient.
  let reservation
  let operation

  try {
    [reservation, operation] = await Promise.all([
      Reservation.findOne({
        environment: "production",
        orderId: id
      }).lean(),

      PaymentOperation.findOne({
        environment: "production",
        orderId: id
      }).lean()
    ])
  } catch {
    return blocked("INITIALIZATION_VERIFICATION_UNCERTAIN")
  }

  if (!isUnclaimedPair(
    reservation,
    operation,
    id,
    purchaseKey,
    amountCents
  )) {
    return blocked("PURCHASE_ALREADY_CLAIMED_OR_CONFLICTING")
  }

  return prepared(id, purchaseKey, !committed)
}
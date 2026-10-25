const reject = reason => Object.freeze({
  eligible: false,
  reason,
  databaseWriteAuthorized: false,
  squareCreationAuthorized: false,
  claimResetAuthorized: false
})

export const assessV3RecoveredLinkEligibility = ({
  order,
  operation,
  verified,
  expectedPaymentLinkId
} = {}) => {
  if (!order || !operation) {
    return reject("missing_records")
  }

  if (
    String(order._id) !== String(operation.orderId) ||
    !operation.orderId
  ) {
    return reject("order_identity_mismatch")
  }

  if (
    order.squareEnvironment !== "sandbox" ||
    operation.environment !== "sandbox" ||
    String(order.currency).toUpperCase() !== "USD"
  ) {
    return reject("environment_mismatch")
  }

  if (
    order.paymentStatus === "paid" ||
    !["payment_required", "pending"].includes(order.status)
  ) {
    return reject("order_not_awaiting_payment")
  }

  if (
    operation.status !== "reconciliation_required" ||
    typeof operation.requestOwner !== "string" ||
    !operation.requestOwner.trim() ||
    !(operation.squareCreationAttemptClaimedAt instanceof Date) ||
    !Number.isFinite(
      operation.squareCreationAttemptClaimedAt.getTime()
    )
  ) {
    return reject("creation_claim_not_preserved")
  }

  if (
    operation.squarePaymentLinkId !== "" ||
    operation.squareOrderId !== "" ||
    operation.paymentUrl !== ""
  ) {
    return reject("existing_operation_link_data")
  }

  if (
    !Number.isSafeInteger(operation.amountCents) ||
    operation.amountCents <= 0 ||
    order.squareExpectedAmountCents !== operation.amountCents
  ) {
    return reject("amount_mismatch")
  }

  if (
    typeof operation.checkoutReferenceId !== "string" ||
    !operation.checkoutReferenceId.trim() ||
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.startsWith("signavi-v3-sandbox-")
  ) {
    return reject("invalid_persisted_identity")
  }

  if (
    verified?.verified !== true ||
    verified?.checkoutReferenceVerified !== true ||
    verified?.amountCents !== operation.amountCents ||
    typeof expectedPaymentLinkId !== "string" ||
    !expectedPaymentLinkId.trim() ||
    verified?.squarePaymentLinkId !== expectedPaymentLinkId ||
    typeof verified?.squareOrderId !== "string" ||
    !verified.squareOrderId.trim()
  ) {
    return reject("square_verification_mismatch")
  }

  if (
    order.squarePaymentLinkId &&
    order.squarePaymentLinkId !== verified.squarePaymentLinkId
  ) {
    return reject("conflicting_order_link")
  }

  if (
    order.squareOrderId &&
    order.squareOrderId !== verified.squareOrderId
  ) {
    return reject("conflicting_square_order")
  }

  let url

  try {
    url = new URL(verified.paymentUrl)
  } catch {
    return reject("invalid_payment_url")
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "sandbox.square.link" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    return reject("invalid_payment_url")
  }

  return Object.freeze({
    eligible: true,
    reason: "verified_link_candidate",
    databaseWriteAuthorized: false,
    squareCreationAuthorized: false,
    claimResetAuthorized: false
  })
}
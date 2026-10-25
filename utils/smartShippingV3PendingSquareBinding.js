import mongoose from "mongoose"
import {
  classifyV3CheckoutReference
} from "./smartShippingV3ReferenceIdentity.js"

// Pure consistency inspection of supplied records.
//
// The caller must load these records from trusted MongoDB
// collections. Caller-supplied objects are not authorization.
//
// Never authorizes Square, modifies MongoDB or releases locks.
export const inspectV3PendingSquareBinding = ({
  order,
  operation
}) => {
  const deny = reason => Object.freeze({
    consistent: false,
    reason,
    squareRequestAuthorized: false
  })

  if (!order || !operation) {
    return deny("missing_records")
  }

  const orderId = String(order._id ?? "")
  const operationOrderId = String(operation.orderId ?? "")

  if (
    !mongoose.isValidObjectId(orderId) ||
    operationOrderId.toLowerCase() !== orderId.toLowerCase()
  ) {
    return deny("order_identity_mismatch")
  }

  const amount = order.squareExpectedAmountCents

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    operation.amountCents !== amount
  ) {
    return deny("payment_amount_mismatch")
  }

  if (
    String(order.currency ?? "").toLowerCase() !== "usd" ||
    order.squareEnvironment !== "sandbox" ||
    operation.environment !== "sandbox"
  ) {
    return deny("payment_environment_mismatch")
  }

  if (
    !["pending", "payment_required"].includes(order.status) ||
    String(order.paymentStatus ?? "").toLowerCase() === "paid"
  ) {
    return deny("order_not_payable")
  }

  const reference = operation.checkoutReferenceId

  if (classifyV3CheckoutReference({
    orderId: orderId.toLowerCase(),
    referenceId: reference
  }) === null) {
    return deny("checkout_reference_mismatch")
  }

  if (
    typeof operation.idempotencyKey !== "string" ||
    !/^signavi-v3-sandbox-[0-9a-f-]{36}$/i.test(
      operation.idempotencyKey
    )
  ) {
    return deny("invalid_idempotency_key")
  }

  if (
    operation.status !== "pending" ||
    Boolean(operation.requestOwner) ||
    Boolean(operation.squarePaymentLinkId) ||
    Boolean(operation.squareOrderId) ||
    Boolean(operation.paymentUrl) ||
    Boolean(order.squarePaymentLinkId)
  ) {
    return deny("payment_already_started_or_linked")
  }

  return Object.freeze({
    consistent: true,
    reason: "pending_records_consistent",
    orderId: orderId.toLowerCase(),
    amountCents: amount,
    checkoutReferenceId: reference,
    squareRequestAuthorized: false
  })
}

import mongoose from "mongoose"
import {
  classifyV3CheckoutReference
} from "./smartShippingV3ReferenceIdentity.js"

// Pure validation only. This does not authorize a write.
// Both Square objects must come from authenticated, verified
// Square lookups, not from untrusted webhook payload fields.
export const verifyV3WebhookPaymentBinding = ({
  order,
  operation,
  payment,
  squareOrder,
  expectedLocationId
} = {}) => {
  const reject = () => {
    throw new Error("V3 webhook payment binding rejected.")
  }

  const id = String(order?._id ?? "")
  const opId = String(operation?.orderId ?? "")
  const string = value =>
    typeof value === "string" ? value.trim() : ""

  const amount = payment?.amount_money?.amount
  const total = squareOrder?.total_money?.amount

  const firstPayment =
    order?.status === "payment_required" &&
    order?.paymentStatus === "unpaid"

  // A paid replay must match the exact stored identities.
  // A public reference alone never establishes replay identity.
  const exactPaidReplay =
    order?.status === "paid" &&
    order?.paymentStatus === "paid" &&
    string(order?.squarePaymentId) === string(payment?.id) &&
    !!string(order?.squarePaymentId) &&
    string(order?.squareOrderId) === string(squareOrder?.id) &&
    !!string(order?.squareOrderId)

  if (!firstPayment && !exactPaidReplay) {
    reject()
  }

  if (
    !mongoose.isObjectIdOrHexString(id) ||
    id !== opId ||
    order?.squareEnvironment !== "sandbox" ||
    operation?.environment !== "sandbox" ||
    operation?.status !== "completed" ||
    String(order?.currency ?? "").toUpperCase() !== "USD" ||
    !string(operation?.requestOwner) ||
    !string(operation?.idempotencyKey).startsWith("signavi-v3-sandbox-") ||
    !string(operation?.squarePaymentLinkId) ||
    !string(operation?.squareOrderId) ||
    !string(operation?.paymentUrl).startsWith("https://sandbox.square.link/") ||
    !string(expectedLocationId) ||
    !string(payment?.id) ||
    payment?.status !== "COMPLETED" ||
    !string(payment?.order_id) ||
    payment?.order_id !== operation.squareOrderId ||
    squareOrder?.id !== operation.squareOrderId ||
    squareOrder?.location_id !== expectedLocationId ||
    payment?.location_id !== expectedLocationId ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    !Number.isSafeInteger(total) ||
    total !== amount ||
    payment?.amount_money?.currency !== "USD" ||
    squareOrder?.total_money?.currency !== "USD" ||
    operation.amountCents !== amount ||
    order.squareExpectedAmountCents !== amount ||
    (order.squareOrderId && order.squareOrderId !== squareOrder.id) ||
    (order.squarePaymentLinkId &&
      order.squarePaymentLinkId !== operation.squarePaymentLinkId) ||
    (order.squarePaymentId && order.squarePaymentId !== payment.id) ||
    (order.paymentUrl && order.paymentUrl !== operation.paymentUrl)
  ) {
    reject()
  }

  const referenceFormat = classifyV3CheckoutReference({
    orderId: id,
    referenceId: operation.checkoutReferenceId
  })

  // Require the Square-safe reference format, never a legacy reference.
  if (
    referenceFormat !== "square_safe" ||
    squareOrder.reference_id !== operation.checkoutReferenceId
  ) {
    reject()
  }

  return Object.freeze({
    bindingVerified: true,
    exactPaidReplay,
    orderId: id,
    squarePaymentId: payment.id,
    squareOrderId: squareOrder.id,
    amountCents: amount,
    environment: "sandbox",
    databaseWriteAuthorized: false,
    paymentCreationAuthorized: false
  })
}
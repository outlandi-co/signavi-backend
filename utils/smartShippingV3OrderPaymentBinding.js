import {
  classifyV3CheckoutReference
} from "./smartShippingV3ReferenceIdentity.js"

// A pure pre-persistence consistency check.
//
// This does not authenticate a guest token or signed quote.
// Those must be verified by the checkout boundary first.
//
// This does not authorize Square calls or prove payment.

export const verifyV3OrderPaymentBinding = ({
  order,
  prepared,
  operation
}) => {
  if (!order || !prepared || !operation) {
    throw new Error("Missing V3 order/payment records.")
  }

  const orderId = String(order._id ?? "")
  const expectedReference = operation.checkoutReferenceId

  const referenceFormat = classifyV3CheckoutReference({
    orderId,
    referenceId: expectedReference
  })

  if (
    !["store", "cart_drawer"].includes(
      String(order.source ?? "").toLowerCase()
    ) ||
    !["payment_required", "pending"].includes(order.status) ||
    order.paymentStatus !== "unpaid" ||
    String(order.currency ?? "").toUpperCase() !== "USD" ||
    order.paymentUrl ||
    order.squarePaymentLinkId ||
    order.squareOrderId ||
    order.squarePaymentId
  ) {
    throw new Error("V3 order is not eligible for payment.")
  }

  if (
    prepared.orderId !== orderId ||
    String(operation.orderId) !== orderId ||
    referenceFormat === null ||
    operation.environment !== "sandbox" ||
    operation.status !== "pending" ||
    !Number.isSafeInteger(prepared.totalCents) ||
    prepared.totalCents <= 0 ||
    !Number.isSafeInteger(prepared.subtotalCents) ||
    prepared.subtotalCents < 0 ||
    !Number.isSafeInteger(prepared.taxCents) ||
    prepared.taxCents < 0 ||
    !Number.isSafeInteger(prepared.shippingAmountCents) ||
    prepared.shippingAmountCents <= 0 ||
    prepared.totalCents !==
      prepared.subtotalCents +
      prepared.taxCents +
      prepared.shippingAmountCents ||
    operation.amountCents !== prepared.totalCents ||
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.startsWith(
      "signavi-v3-sandbox-"
    )
  ) {
    throw new Error("V3 order/payment binding mismatch.")
  }

  return Object.freeze({
    orderId,
    checkoutReferenceId: expectedReference,
    amountCents: prepared.totalCents,
    environment: "sandbox",
    bindingVerified: true,
    squareRequestAuthorized: false
  })
}

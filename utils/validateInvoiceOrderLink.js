import mongoose from "mongoose"

// Pure safety validation only.
// Caller must independently verify admin authorization,
// load both records from MongoDB, and enforce atomic linking.
export const validateInvoiceOrderLink = ({ invoice, order }) => {
  const invalid = reason => Object.freeze({
    eligible: false,
    reason
  })

  if (
    !invoice ||
    !order ||
    !mongoose.isObjectIdOrHexString(invoice._id) ||
    !mongoose.isObjectIdOrHexString(order._id)
  ) {
    return invalid("invalid_documents")
  }

  if (invoice.linkedOrderId != null) {
    return invalid("invoice_already_linked")
  }

  if (
    invoice.paymentStatus !== "unpaid" ||
    invoice.status !== "draft" ||
    invoice.finalProof?.approved === true ||
    invoice.paymentUrl ||
    invoice.squareCheckoutId ||
    invoice.squarePaymentLinkId ||
    invoice.squareOrderId ||
    invoice.squarePaymentId ||
    invoice.paidAt
  ) {
    return invalid("invoice_payment_or_approval_history")
  }

  if (
    order.paymentStatus !== "unpaid" ||
    order.paymentUrl ||
    order.squareOrderId ||
    order.squarePaymentLinkId ||
    order.squarePaymentId
  ) {
    return invalid("order_payment_history")
  }

  return Object.freeze({
    eligible: true,
    invoiceId: String(invoice._id),
    orderId: String(order._id),
    purchaseKey: `order:${String(order._id).toLowerCase()}`
  })
}
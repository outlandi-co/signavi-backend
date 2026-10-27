import { validateInvoiceOrderLink } from "./validateInvoiceOrderLink.js"

// Testable, fail-closed decision function.
// Evidence must be fetched by a trusted caller from the database.
// This function does not query, update, reserve or authorize payment.
export const validateInvoiceOrderPaymentEvidence = ({
  invoice,
  order,
  paymentOperations,
  orderReservations,
  invoiceReservations,
  purchaseReservations
} = {}) => {
  const deny = reason => Object.freeze({
    eligible: false,
    reason,
    squareRequestAuthorized: false
  })

  const base = validateInvoiceOrderLink({ invoice, order })

  if (!base.eligible) {
    return deny(base.reason)
  }

  const evidence = {
    paymentOperations,
    orderReservations,
    invoiceReservations,
    purchaseReservations
  }

  if (
    Object.values(evidence).some(
      records => !Array.isArray(records)
    )
  ) {
    return deny("payment_evidence_incomplete")
  }

  if (paymentOperations.length) {
    return deny("order_payment_operation_exists")
  }

  if (orderReservations.length) {
    return deny("order_payment_reservation_exists")
  }

  if (invoiceReservations.length) {
    return deny("invoice_payment_reservation_exists")
  }

  if (purchaseReservations.length) {
    return deny("purchase_reservation_exists")
  }

  return Object.freeze({
    eligible: true,
    invoiceId: base.invoiceId,
    orderId: base.orderId,
    purchaseKey: base.purchaseKey,
    squareRequestAuthorized: false
  })
}
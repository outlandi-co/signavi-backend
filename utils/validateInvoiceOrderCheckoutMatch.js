import mongoose from "mongoose"
import { validateInvoiceOrderLink } from "./validateInvoiceOrderLink.js"

const toCents = value => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  const scaled = value * 100
  const cents = Math.round(scaled)

  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    Math.abs(scaled - cents) > 0.000001
  ) {
    return null
  }

  return cents
}

// Pure validation only. "prepared" MUST originate from trusted,
// signed-quote-verified backend checkout preparation.
// This function does not establish that provenance itself.
export const validateInvoiceOrderCheckoutMatch = ({
  invoice,
  order,
  prepared
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

  const invoiceEmail = String(invoice.customerEmail || "")
    .trim().toLowerCase()

  const orderEmail = String(order.email || "")
    .trim().toLowerCase()

  if (
    !invoiceEmail ||
    !orderEmail ||
    invoiceEmail !== orderEmail
  ) {
    return deny("customer_email_mismatch")
  }

  if (
    !prepared ||
    !mongoose.isObjectIdOrHexString(prepared.orderId) ||
    String(prepared.orderId).toLowerCase() !==
      String(order._id).toLowerCase()
  ) {
    return deny("checkout_order_mismatch")
  }

  const amountCents = toCents(invoice.total)

  if (
    amountCents === null ||
    !Number.isSafeInteger(prepared.totalCents) ||
    prepared.totalCents <= 0 ||
    amountCents !== prepared.totalCents
  ) {
    return deny("checkout_amount_mismatch")
  }

  return Object.freeze({
    eligible: true,
    invoiceId: base.invoiceId,
    orderId: base.orderId,
    purchaseKey: base.purchaseKey,
    amountCents,
    squareRequestAuthorized: false
  })
}
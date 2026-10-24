import Order from "../models/Order.js"
import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"
import {
  coordinateV3PaymentPreparation
} from "./smartShippingV3PaymentCoordinator.js"
import {
  persistV3AtomicOrderPayment
} from "./smartShippingV3AtomicOrderPayment.js"

// Internal development-only checkout preparation.
//
// This workflow never creates a Square payment,
// never authorizes a Square request, and is not
// connected to the HTTP checkout route.
//
// Its separate flag defaults to disabled.

const isWorkflowEnabled = () =>
  ["development", "test"].includes(
    String(process.env.NODE_ENV || "").toLowerCase()
  ) &&
  String(process.env.SMART_SHIPPING_V3_ENABLED || "")
    .toLowerCase() === "true" &&
  String(
    process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED || ""
  ).toLowerCase() === "true" &&
  String(process.env.SQUARE_ENVIRONMENT || "")
    .toLowerCase() === "sandbox"

export const prepareV3SandboxCheckoutWorkflow = async ({
  orderId,
  guestToken,
  signedQuote
}) => {
  if (!isWorkflowEnabled()) {
    throw new Error(
      "V3 Sandbox checkout workflow is disabled."
    )
  }

  // Initial authentication and quote validation
  // happen before any new checkout lock is acquired.
  const order = await Order.findById(orderId)

  if (!order) {
    throw new Error("V3 checkout order not found.")
  }

  const prepared = prepareV3CheckoutPayment({
    order,
    guestToken,
    signedQuote
  })

  if (!prepared) {
    throw new Error(
      "V3 checkout authorization or quote invalid."
    )
  }

  const coordinated = await coordinateV3PaymentPreparation({
    orderId: prepared.orderId,
    amountCents: prepared.totalCents
  })

  if (!coordinated.success) {
    return Object.freeze({
      success: false,
      reason: coordinated.reason,
      squareRequestAuthorized: false
    })
  }

  // Atomic persistence rechecks authentication,
  // quote, totals, and checkout-lock ownership
  // against fresh database records.
  //
  // A failure leaves the lock for explicit,
  // state-aware reconciliation. Never blindly
  // release a lock after an uncertain failure.
  const persisted = await persistV3AtomicOrderPayment({
    lock: coordinated.lock,
    guestToken,
    signedQuote
  })

  return Object.freeze({
    success: true,
    ...persisted,
    squareRequestAuthorized: false
  })
}
import {
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js"

// Parses a public correlation reference only.
// Never use this result alone to authorize a payment,
// database update, Square request, or claim release.
export const parseV3WebhookOrderReference = ({
  referenceId
} = {}) => {
  if (typeof referenceId !== "string") {
    return null
  }

  const match = /^signavi-v3-([a-f0-9]{24})$/.exec(referenceId)

  if (!match) {
    return null
  }

  const orderId = match[1]

  if (
    createV3SquareSafeCheckoutReference({ orderId }) !==
    referenceId
  ) {
    return null
  }

  return Object.freeze({
    orderId,
    referenceId,
    paymentAuthorized: false,
    databaseWriteAuthorized: false,
    squareRequestAuthorized: false
  })
}
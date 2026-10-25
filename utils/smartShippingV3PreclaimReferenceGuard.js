import {
  assertV3SquareSafeReference
} from "./smartShippingV3ReferenceIdentity.js"

// Call BEFORE a durable Square creation claim.
//
// This guard validates reference identity only.
// It never grants payment authorization or
// replaces trusted order/payment ownership checks.
export const assertV3PreclaimSquareReference = ({
  orderId,
  checkoutReferenceId
}) => {
  const referenceId = assertV3SquareSafeReference({
    orderId,
    referenceId: checkoutReferenceId
  })

  if (
    typeof referenceId !== "string" ||
    referenceId.length > 40
  ) {
    throw new Error("Invalid Square payment reference length.")
  }

  return Object.freeze({
    checkoutReferenceId: referenceId,
    referenceLength: referenceId.length,
    squareRequestAuthorized: false
  })
}

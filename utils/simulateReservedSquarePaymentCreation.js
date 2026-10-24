import mongoose from "mongoose"

// TEST-ONLY harness. Never wire directly into an HTTP route.
// No Square SDK imports, credentials, or database access.
export const simulateReservedSquarePaymentCreation = async ({
  preparation,
  orderId,
  environment,
  amountCents,
  fakeCreatePaymentLink
}) => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test-only execution is disabled.")
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    !["sandbox", "production"].includes(environment) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("Invalid payment execution input.")
  }

  const matches =
    preparation?.prepared === true &&
    preparation?.squareRequestAuthorized === false &&
    preparation?.paymentCreated === false &&
    preparation?.orderId === String(orderId) &&
    preparation?.environment === environment &&
    preparation?.amountCents === amountCents &&
    typeof preparation?.owner === "string" &&
    preparation.owner.trim().length > 0 &&
    preparation?.idempotencyKey ===
      `signavi-${environment}-${orderId}`

  if (!matches) {
    return Object.freeze({
      simulated: false,
      blocked: true,
      reason: "invalid_or_missing_reservation",
      squareRequestAuthorized: false
    })
  }

  if (typeof fakeCreatePaymentLink !== "function") {
    throw new Error("Missing fake payment creator.")
  }

  try {
    const response = await fakeCreatePaymentLink({
      idempotencyKey: preparation.idempotencyKey,
      amountCents
    })

    if (
      typeof response?.id !== "string" ||
      !response.id ||
      typeof response?.orderId !== "string" ||
      !response.orderId ||
      typeof response?.url !== "string" ||
      !response.url
    ) {
      return Object.freeze({
        simulated: true,
        blocked: true,
        reconciliationRequired: true,
        squareRequestAuthorized: false
      })
    }

    return Object.freeze({
      simulated: true,
      blocked: false,
      reconciliationRequired: true,
      squareRequestAuthorized: false
    })
  } catch {
    return Object.freeze({
      simulated: true,
      blocked: true,
      reconciliationRequired: true,
      squareRequestAuthorized: false
    })
  }
}
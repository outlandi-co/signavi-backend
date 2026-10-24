const nonempty = value =>
  typeof value === "string" && value.trim().length > 0

const squareAmountCents = value => {
  if (typeof value === "bigint") {
    return value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : null
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0
      ? value
      : null
  }

  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const n = Number(value)
    return Number.isSafeInteger(n) ? n : null
  }

  return null
}

// Verifies externally retrieved Square records.
// Pure function: no network calls and no database writes.
// This does not verify that a customer has paid.

export const verifyV3SquarePaymentLink = ({
  expectedPaymentLinkId,
  expectedAmountCents,
  paymentLink,
  squareOrder
}) => {
  if (
    !nonempty(expectedPaymentLinkId) ||
    !Number.isSafeInteger(expectedAmountCents) ||
    expectedAmountCents <= 0
  ) {
    throw new Error("Invalid V3 Square verification inputs.")
  }

  if (
    !paymentLink ||
    paymentLink.id !== expectedPaymentLinkId ||
    !nonempty(paymentLink.orderId) ||
    !nonempty(paymentLink.url)
  ) {
    throw new Error("Square payment-link identity mismatch.")
  }

  let parsedUrl

  try {
    parsedUrl = new URL(paymentLink.url)
  } catch {
    throw new Error("Invalid Square payment-link URL.")
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error("Invalid Square payment-link URL.")
  }

  if (
    !squareOrder ||
    squareOrder.id !== paymentLink.orderId
  ) {
    throw new Error("Square order identity mismatch.")
  }

  const totalMoney =
    squareOrder.totalMoney ?? squareOrder.total_money

  const amountCents = squareAmountCents(totalMoney?.amount)

  if (
    amountCents !== expectedAmountCents ||
    totalMoney?.currency !== "USD"
  ) {
    throw new Error("Square order amount or currency mismatch.")
  }

  return {
    verified: true,
    squarePaymentLinkId: paymentLink.id,
    squareOrderId: squareOrder.id,
    paymentUrl: paymentLink.url,
    amountCents,
    currency: "USD"
  }
}
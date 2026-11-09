const OBJECT_ID = /^[a-f0-9]{24}$/i

const UUID_V4 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

const VALID_PAYMENT_STATUSES = new Set([
  "unpaid",
  "paid",
  "refunded"
])

export function buildStudioPaymentStatusProjection(
  order,
  attemptKey
) {
  const id = String(order?._id ?? "")
  const suppliedKey = String(attemptKey ?? "").toLowerCase()
  const storedKey = String(
    order?.storefrontCreationAttemptKey ?? ""
  ).toLowerCase()

  if (
    order?.storefront !== "signavi_studio" ||
    !OBJECT_ID.test(id) ||
    !UUID_V4.test(suppliedKey) ||
    !UUID_V4.test(storedKey) ||
    suppliedKey !== storedKey ||
    !VALID_PAYMENT_STATUSES.has(order?.paymentStatus)
  ) {
    throw new Error("STUDIO_PAYMENT_STATUS_PROJECTION_BLOCKED")
  }

  // Presentation only. This does not authenticate a caller,
  // authorize an order lookup, or verify Square evidence.
  // A future handler must independently enforce those checks.
  return Object.freeze({
    orderId: id,
    storefront: "signavi_studio",
    paymentStatus: order.paymentStatus
  })
}
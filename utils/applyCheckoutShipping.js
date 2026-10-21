
import { verifyShippingQuote } from "./shippingQuote.js"

const money = (value) => {
  const n = Number(value)

  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid order amount.")
  }

  return Math.round((n + Number.EPSILON) * 100) / 100
}

const setShippingAmount = (order, amount) => {
  order.shipping = amount
  order.shippingCost = amount
  order.shippingTotal = amount
  order.deliveryFee = amount

  order.finalPrice = money(
    money(order.subtotal) +
    money(order.tax) +
    amount
  )
}

export function applyCheckoutShipping(
  order,
  body = {}
) {
  const items = order.items || []

  if (!items.length) {
    throw new Error("Order has no items.")
  }

  const hasPhysicalItems = items.some(
    (item) =>
      !["digital", "service"].includes(
        String(item.productType || "physical")
          .toLowerCase()
      )
  )

  if (!hasPhysicalItems) {
    setShippingAmount(order, 0)
    order.shippingRateId = ""
    order.shippingRateIds = []
    order.shippingProvider = ""
    order.shippingService = ""
    order.shippingRate = null

    return { amount: 0 }
  }

  const destination =
    body.shippingAddress || body.address

  if (!destination || !body.shippingQuote) {
    throw new Error(
      "Select a shipping rate before checkout."
    )
  }

  // Test shipping quotes are permitted only when Square
// is explicitly configured for Sandbox.
// Production and missing configurations reject test rates.
const squareEnvironment = String(
  process.env.SQUARE_ENVIRONMENT || ""
).trim().toLowerCase()

const allowTestShipping =
  squareEnvironment === "sandbox" &&
  Boolean(String(process.env.SQUARE_ACCESS_TOKEN || "").trim()) &&
  Boolean(String(process.env.SQUARE_LOCATION_ID || "").trim())

const quote = verifyShippingQuote(
  body.shippingQuote,
  {
    items: items.map((item) => ({
      productId: String(item.productId || ""),
      quantity: item.quantity
    })),
    destination,
    allowTest: allowTestShipping
  }
)

  order.address = {
    street: String(
      destination.street1 ||
      destination.street ||
      ""
    ).trim(),
    city: String(destination.city || "").trim(),
    state: String(destination.state || "").trim(),
    zip: String(destination.zip || "").trim(),
    country: String(destination.country || "US")
      .trim()
      .toUpperCase()
  }

  setShippingAmount(order, quote.amount)

  order.shippingRateId = quote.rateId
  order.shippingRateIds = quote.rateIds
  order.shippingProvider = quote.provider
  order.shippingService = quote.service

  order.shippingRate = {
    object_id: quote.rateId,
    rateIds: quote.rateIds,
    parcelRates: quote.parcelRates,
    amount: String(quote.amount),
    currency: quote.currency,
    provider: quote.provider,
    servicelevel: {
      name: quote.service
    }
  }

  return quote
}

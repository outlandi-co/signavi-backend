import express from "express"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { verifySquareAuthorization } from "../utils/squarePaymentAuth.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED")

// Set SQUARE_ENVIRONMENT=sandbox or production in the V2 environment.
// Never default to Production: require an explicit choice.
const squareMode = String(process.env.SQUARE_ENVIRONMENT || "")
  .trim()
  .toLowerCase()

const configuredEnvironment =
  squareMode === "sandbox"
    ? SquareEnvironment.Sandbox
    : squareMode === "production"
      ? SquareEnvironment.Production
      : null

const squareToken = String(process.env.SQUARE_ACCESS_TOKEN || "").trim()
const LOCATION_ID = String(process.env.SQUARE_LOCATION_ID || "").trim()
const CLIENT_URL = String(process.env.CLIENT_URL || "").trim().replace(/\/$/, "")

// Build the client only when all required configuration exists.
// Keeping it null allows unrelated V2 API endpoints to remain available.
const client = configuredEnvironment && squareToken && LOCATION_ID
  ? new SquareClient({
      token: squareToken,
      environment: configuredEnvironment
    })
  : null

if (!client) {
  console.warn(
    "⚠️ Square payments not configured: set SQUARE_ENVIRONMENT " +
    "(sandbox or production), SQUARE_ACCESS_TOKEN, and SQUARE_LOCATION_ID."
  )
} else {
  console.log(`💳 Square environment: ${squareMode}`)
}

const TAX_RATE = 0.0825

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const getItemPrice = (item = {}) => {
  return toNumber(
    item.salePrice ??
      item.finalPrice ??
      item.unitPrice ??
      item.price ??
      item.selectedVariant?.price ??
      item.variant?.price ??
      item.basePrice ??
      item.listPrice ??
      0
  )
}

const getItemQuantity = (item = {}) => {
  return Math.max(1, toNumber(item.quantity, 1))
}

const getShipping = (record = {}) => {
  return toNumber(
    record.shippingCost ??
      record.shipping ??
      record.shippingTotal ??
      record.deliveryFee ??
      record.shippingRate?.amount ??
      0
  )
}

const getSubtotal = (record = {}) => {
  if (Array.isArray(record.items) && record.items.length > 0) {
    return record.items.reduce((sum, item) => {
      const price = getItemPrice(item)
      const qty = getItemQuantity(item)

      console.log("🛒 SQUARE ITEM:", {
        name: item.name,
        salePrice: item.salePrice,
        finalPrice: item.finalPrice,
        unitPrice: item.unitPrice,
        price: item.price,
        selectedVariantPrice: item.selectedVariant?.price,
        parsedPrice: price,
        quantity: qty
      })

      return sum + price * qty
    }, 0)
  }

  return toNumber(record.subtotal) || toNumber(record.price) || 0
}

router.post("/create-payment/:id", async (req, res) => {
  try {
    // Do not call Square or modify an order if V2 isn't explicitly configured.
    if (!client) {
      return res.status(503).json({
        success: false,
        message: "Square payments are not configured for this backend."
      })
    }

    if (!CLIENT_URL) {
      return res.status(503).json({
        success: false,
        message: "CLIENT_URL is not configured for Square checkout."
      })
    }

    const { id } = req.params

    if (!id || id === "null" || id === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      })
    }

    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found"
      })
    }

    // Storefront orders must be authorized by backend checkout.
    // Preserve the separate custom quote payment workflow.
    const isStorefrontOrder =
      type === "order" &&
      (
        ["store", "cart_drawer"].includes(
          String(record.source || "").toLowerCase()
        ) ||
        (
          Array.isArray(record.items) &&
          record.items.some((item) =>
            Boolean(item.productId)
          )
        )
      )

    if (isStorefrontOrder) {
      const authorization = req.get(
        "x-signavi-payment-authorization"
      )

      if (
        !verifySquareAuthorization(
          record,
          authorization
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Complete secure checkout before creating a payment."
        })
      }
    }

    const subtotal = getSubtotal(record)
    const shipping = getShipping(record)

    const tax =
      toNumber(record.tax) ||
      subtotal * TAX_RATE

    // Storefront orders must charge the exact total
    // calculated and saved by the backend checkout.
    // Preserve existing custom quote calculations.
    const total = isStorefrontOrder
      ? toNumber(record.finalPrice)
      : (
          toNumber(record.finalPrice) && shipping
            ? toNumber(record.finalPrice)
            : subtotal + shipping + tax
        )

    console.log("💰 FINAL SQUARE CALC:", {
      type,
      id: record._id,
      subtotal,
      shipping,
      tax,
      total,
      savedShippingCost: record.shippingCost,
      savedShipping: record.shipping,
      savedShippingTotal: record.shippingTotal,
      savedDeliveryFee: record.deliveryFee,
      savedShippingRateAmount: record.shippingRate?.amount
    })

    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid total",
        debug: {
          subtotal,
          shipping,
          tax,
          total
        }
      })
    }

    const amount = BigInt(Math.round(total * 100))

    const lineItems = [
      {
        name: `${type.toUpperCase()} #${record._id}`,
        quantity: "1",
        basePriceMoney: {
          amount,
          currency: "USD"
        }
      }
    ]

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: LOCATION_ID,
        note: `ID:${record._id}`,
        lineItems
      },
      checkoutOptions: {
        redirectUrl: `${CLIENT_URL}/success/${id}`,
        askForShippingAddress: false
      }
    })

    const paymentUrl = response?.paymentLink?.url

    if (!paymentUrl) {
      console.error("❌ Square did not return a payment link")
      throw new Error("No payment URL returned")
    }

    record.subtotal = subtotal
    record.shipping = shipping
    record.shippingCost = shipping
    record.tax = tax
    record.finalPrice = total
    record.paymentUrl = paymentUrl

    await record.save()

    console.log("✅ PAYMENT LINK CREATED")

    res.json({
      success: true,
      paymentUrl,
      orderId: record._id,
      totals: {
        subtotal,
        shipping,
        tax,
        total
      }
    })
  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message || "Square payment failed"
    })
  }
})

export default router

import express from "express"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED")

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

const LOCATION_ID = process.env.SQUARE_LOCATION_ID
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

const getShipping = (record = {}) => {
  return toNumber(
    record.shippingCost ??
      record.shipping ??
      record.shippingTotal ??
      record.deliveryFee ??
      0
  )
}

router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!id || id === "null" || id === "undefined") {
      return res.status(400).json({ message: "Invalid ID" })
    }

    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      return res.status(404).json({ message: "Record not found" })
    }

    let subtotal = 0

    if (Array.isArray(record.items) && record.items.length > 0) {
      subtotal = record.items.reduce((sum, item) => {
        const price = getItemPrice(item)
        const qty = toNumber(item.quantity, 1)

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

    if (!subtotal) {
      subtotal =
        toNumber(record.subtotal) ||
        toNumber(record.finalPrice) ||
        toNumber(record.price) ||
        0
    }

    const shipping = getShipping(record)
    const tax = toNumber(record.tax, subtotal * TAX_RATE)
    const total = subtotal + shipping + tax

    console.log("💰 FINAL SQUARE CALC:", {
      type,
      id: record._id,
      subtotal,
      shipping,
      tax,
      total
    })

    if (!total || total <= 0) {
      return res.status(400).json({
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

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: LOCATION_ID,
        note: `ID:${record._id}`,
        lineItems: [
          {
            name: `${type.toUpperCase()} #${record._id}`,
            quantity: "1",
            basePriceMoney: {
              amount,
              currency: "USD"
            }
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${id}`
      }
    })

    const paymentUrl = response?.paymentLink?.url

    if (!paymentUrl) {
      console.error("❌ Square response:", response)
      throw new Error("No payment URL returned")
    }

    record.subtotal = subtotal
    record.shippingCost = shipping
    record.tax = tax
    record.finalPrice = total
    record.paymentUrl = paymentUrl

    await record.save()

    console.log("✅ PAYMENT LINK CREATED:", paymentUrl)

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
    res.status(500).json({ message: err.message })
  }
})

export default router
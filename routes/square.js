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
const BASE_URL = "https://signavi-backend.onrender.com"

router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!id || id === "null") {
      return res.status(400).json({ message: "Invalid ID" })
    }

    /* ================= FIND RECORD ================= */
    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      return res.status(404).json({ message: "Record not found" })
    }

    /* ================= PREVENT DUPLICATE ================= */
    if (record.paymentUrl) {
      console.log("⚠️ Reusing payment link:", record.paymentUrl)

      return res.json({
        success: true,
        paymentUrl: record.paymentUrl,
        orderId: record._id
      })
    }

    /* ================= BULLETPROOF CALC ================= */
    let subtotal = 0

    if (record.items?.length) {
      subtotal = record.items.reduce((sum, item) => {
        const price = Number(item.price || item.selectedVariant?.price || 0)
        const qty = Number(item.quantity || 1)
        return sum + (price * qty)
      }, 0)
    }

    // fallback if items missing
    if (!subtotal) {
      subtotal =
        Number(record.subtotal) ||
        Number(record.finalPrice) ||
        Number(record.price) ||
        0
    }

    const shipping = Number(record.shippingCost || 0)
    const tax = Number(record.tax || subtotal * 0.0825)
    const total = subtotal + shipping + tax

    console.log("💰 FINAL CALC:", {
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
          record
        }
      })
    }

    /* ================= SQUARE PAYMENT ================= */
    const amount = Math.round(total * 100) // 🔥 must be integer cents

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-payment`,
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

    /* ================= SAVE ================= */
    record.paymentUrl = paymentUrl
    await record.save()

    console.log("✅ PAYMENT LINK CREATED:", paymentUrl)

    res.json({
      success: true,
      paymentUrl,
      orderId: record._id
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
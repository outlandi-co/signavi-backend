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

    /* ================= FIXED CALCULATION ================= */
    let subtotal =
      Number(record.subtotal) ||
      Number(record.finalPrice) ||   // 🔥 THIS IS THE FIX
      Number(record.price) ||
      0

    let shipping = Number(record.shippingCost || 0)
    let tax = Number(record.tax || subtotal * 0.0825)

    const total = subtotal + shipping + tax

    console.log("💰 CALC DEBUG:", {
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

    /* ================= SQUARE FIX ================= */
    const amount = Math.round(total * 100) // 🔥 remove BigInt

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
      throw new Error("No payment URL returned")
    }

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
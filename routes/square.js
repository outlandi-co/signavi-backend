import express from "express"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

dotenv.config()

const router = express.Router()

/* ================= DEBUG ================= */
console.log("🔥 NEW SQUARE CLIENT LOADED")
console.log("🔥 TOKEN EXISTS:", !!process.env.SQUARE_ACCESS_TOKEN)
console.log("🔥 LOCATION EXISTS:", !!process.env.SQUARE_LOCATION_ID)
console.log("🌐 CLIENT_URL:", process.env.CLIENT_URL)

/* 🚨 HARD FAIL */
if (!process.env.SQUARE_ACCESS_TOKEN) {
  throw new Error("❌ Missing SQUARE_ACCESS_TOKEN")
}

if (!process.env.SQUARE_LOCATION_ID) {
  throw new Error("❌ Missing SQUARE_LOCATION_ID")
}

/* ================= CLIENT ================= */
const client = new SquareClient({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

/* ================= TEST ================= */
router.get("/__test", (req, res) => {
  res.json({ message: "SQUARE ROUTE LIVE ✅" })
})

/* =========================================================
   💳 CREATE PAYMENT LINK (WITH TAX)
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    console.log("💳 CREATE PAYMENT:", req.params.id)

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const rawAmount = order.finalPrice || order.price || 0

    if (!rawAmount || rawAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" })
    }

    const TAX_RATE = 0.0825
    const subtotalCents = Math.round(Number(rawAmount) * 100)

    console.log("💰 SUBTOTAL:", rawAmount)
    console.log("📍 LOCATION:", process.env.SQUARE_LOCATION_ID)

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      /* 🔥 SWITCHED FROM quickPay → order */
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        lineItems: [
          {
            name: `Order #${order._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: BigInt(subtotalCents),
              currency: "USD"
            }
          }
        ],

        taxes: [
          {
            name: "Sales Tax",
            percentage: (TAX_RATE * 100).toFixed(2),
            scope: "ORDER"
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${order._id}`
      }
    })

    const url =
      response?.paymentLink?.url ||
      response?.url

    if (!url) {
      console.error("❌ FULL RESPONSE:", response)
      throw new Error("No payment link returned")
    }

    console.log("🚀 Square URL:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)

    if (err?.body) {
      console.error("🔎 Square API:", err.body)
    }

    res.status(500).json({
      message: err.message,
      details: err?.body || null
    })
  }
})

/* =========================================================
   🔥 CONFIRM PAYMENT
========================================================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (order.status === "paid") {
      return res.json({ success: true, message: "Already paid" })
    }

    order.status = "paid"

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status: "paid",
      date: new Date(),
      note: "Paid via Square"
    })

    await order.save()

    const io = req.app.get("io")
    if (io) io.emit("jobUpdated", order)

    if (order.email) {
      try {
        await sendOrderStatusEmail(
          order.email,
          "paid",
          order._id,
          order
        )
      } catch (err) {
        console.warn("⚠️ Email failed:", err.message)
      }
    }

    console.log("✅ ORDER MARKED PAID:", order._id)

    res.json({ success: true })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
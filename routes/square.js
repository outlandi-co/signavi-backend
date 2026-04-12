import express from "express"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { SquareClient } from "square"

dotenv.config()

const router = express.Router()

/* ================= DEBUG ENV ================= */
console.log("🔥 SQUARE TOKEN EXISTS:", !!process.env.SQUARE_ACCESS_TOKEN)
console.log("🔥 LOCATION ID EXISTS:", !!process.env.SQUARE_LOCATION_ID)

/* 🚨 HARD FAIL if missing */
if (!process.env.SQUARE_ACCESS_TOKEN) {
  throw new Error("❌ SQUARE_ACCESS_TOKEN is missing in environment")
}

if (!process.env.SQUARE_LOCATION_ID) {
  throw new Error("❌ SQUARE_LOCATION_ID is missing in environment")
}

/* ================= CLIENT ================= */
/* 🔥 FIX: use `token` NOT `accessToken` */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

/* ================= HELPER ================= */
const toCents = (amount) => {
  return BigInt(Math.round(Number(amount || 0) * 100))
}

/* ================= TEST ================= */
router.get("/__test", (req, res) => {
  res.json({ message: "SQUARE ROUTE LIVE ✅" })
})

/* ================= CREATE PAYMENT ================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    console.log("💳 CREATE PAYMENT:", req.params.id)

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const rawAmount = order.finalPrice || order.price || 0
    const amount = toCents(rawAmount)

    if (!amount || amount <= 0n) {
      return res.status(400).json({ message: "Invalid amount" })
    }

    console.log("💰 Amount (cents):", amount.toString())

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      quickPay: {
        name: `Order #${order._id.toString().slice(-6)}`,
        priceMoney: {
          amount,
          currency: "USD"
        },
        locationId: process.env.SQUARE_LOCATION_ID
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${order._id}`
      }
    })

    const url = response.paymentLink?.url

    if (!url) throw new Error("No payment link returned")

    console.log("🚀 Square URL:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)

    if (err.response?.body) {
      console.error("🔎 Square API Response:", err.response.body)
    }

    res.status(500).json({
      message: err.message,
      details: err.response?.body || null
    })
  }
})

/* ================= CONFIRM ================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (order.status !== "paid") {
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

      console.log("✅ ORDER MARKED PAID:", order._id)
    }

    res.json({ success: true })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
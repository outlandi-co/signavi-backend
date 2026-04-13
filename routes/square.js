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
console.log("🔑 TOKEN VALUE:", process.env.SQUARE_ACCESS_TOKEN?.slice(0, 10) + "...")

/* 🚨 HARD FAIL */
if (!process.env.SQUARE_ACCESS_TOKEN) {
  throw new Error("❌ Missing SQUARE_ACCESS_TOKEN")
}

if (!process.env.SQUARE_LOCATION_ID) {
  throw new Error("❌ Missing SQUARE_LOCATION_ID")
}

/* ================= CLIENT ================= */
/* ✅ FIXED: use token (NOT accessToken) */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Sandbox
})

/* ================= HELPER ================= */
/* ✅ FIXED: no BigInt */
const toCents = (amount) => {
  return BigInt(Math.round(Number(amount || 0) * 100))
}

/* ================= TEST ================= */
router.get("/__test", (req, res) => {
  res.json({ message: "SQUARE ROUTE LIVE ✅" })
})

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    console.log("💳 CREATE PAYMENT:", req.params.id)

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    console.log("🧾 ORDER:", order)

    const rawAmount = order.finalPrice || order.price || 0
    const amount = toCents(rawAmount)

    console.log("💰 RAW:", rawAmount)
    console.log("💰 CENTS:", amount.toString())
    console.log("🔎 TYPE:", typeof amount)

    if (!amount || amount <= 0n) {
      return res.status(400).json({ message: "Invalid amount" })
    }

    if (!process.env.CLIENT_URL) {
      return res.status(500).json({
        message: "CLIENT_URL missing in environment"
      })
    }

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      quickPay: {
        name: `Order #${order._id.toString().slice(-6)}`,
        priceMoney: {
          amount, // ✅ NUMBER
          currency: "USD"
        },
        locationId: process.env.SQUARE_LOCATION_ID
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${order._id}`
      }
    })

    const url = response?.paymentLink?.url

    if (!url) {
      throw new Error("No payment link returned")
    }

    console.log("🚀 Square URL:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)

    if (err?.body) {
      console.error("🔎 Square API Response:", err.body)
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

    /* 🔥 SOCKET */
    const io = req.app.get("io")
    if (io) io.emit("jobUpdated", order)

    /* 📧 EMAIL */
    try {
      if (order.email) {
        await sendOrderStatusEmail(
          order.email,
          "paid",
          order._id,
          order
        )
      }
    } catch (err) {
      console.warn("⚠️ Email failed:", err.message)
    }

    console.log("✅ ORDER MARKED PAID:", order._id)

    res.json({ success: true })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
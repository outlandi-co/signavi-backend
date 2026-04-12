import express from "express"
import dotenv from "dotenv"
import Order from "../models/Order.js"

import { SquareClient } from "square"

dotenv.config()

const router = express.Router()

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: "sandbox"
})

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

    const amount = Math.round(
      Number(order.finalPrice || order.price || 0) * 100
    )

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" })
    }

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
    res.status(500).json({ message: err.message })
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
    }

    res.json({ success: true })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
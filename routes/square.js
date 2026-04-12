import express from "express"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { Client, Environment } from "square"

dotenv.config()

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Sandbox // 🔁 change to Production later
})

const { checkoutApi } = client

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
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

    const response = await checkoutApi.createPaymentLink({
      idempotencyKey: `${order._id}-${Date.now()}`,

      quickPay: {
        name: `Order #${order._id.slice(-6)}`,
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

    const url = response.result.paymentLink?.url

    if (!url) throw new Error("No payment link returned")

    console.log("💳 Square link:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ✅ MARK ORDER AS PAID (after redirect)
========================================================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (order.status !== "paid") {
      order.status = "paid"

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

/* DEBUG */
router.get("/__test", (req, res) => {
  res.json({ message: "SQUARE ROUTE LIVE ✅" })
})

export default router
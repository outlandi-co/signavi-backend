import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

/* ================= STRIPE INIT ================= */
let stripe = null

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  })
  console.log("💳 Stripe initialized (checkout)")
} else {
  console.warn("⚠️ STRIPE_SECRET_KEY missing — Stripe disabled")
}

/* ================= CREATE CHECKOUT ================= */
router.post("/create-checkout/:id", async (req, res) => {
  try {

    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const amount = Math.round((order.finalPrice || order.price || 0) * 100)

    /* 🚨 VALIDATION */
    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: "Order must have a price before payment"
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Order ${order._id}`
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],

      success_url: `http://localhost:5173/success/${order._id}`,
      cancel_url: `http://localhost:5173/admin/orders`,

      metadata: {
        orderId: order._id.toString()
      }
    })

    console.log("💳 Stripe session created:", session.id)

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ STRIPE CHECKOUT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
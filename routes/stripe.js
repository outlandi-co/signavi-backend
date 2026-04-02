import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

dotenv.config()

console.log("🔥 STRIPE ROUTES LOADED")

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
})

const FRONTEND_URL = "http://localhost:5173"

/* ================= CREATE CHECKOUT ================= */
router.post("/create-checkout-session/:id", async (req, res) => {
  try {
    const { id } = req.params

    const order = await Order.findById(id)

    if (!order) {
      console.log("❌ ORDER NOT FOUND:", id)
      return res.status(404).json({ message: "Order not found" })
    }

    /* 🔥 DEBUG LOG */
    console.log("🧾 ORDER STATUS:", order.status)

    /* 🔥 ALLOW MULTIPLE VALID STATES */
    if (!["payment_required", "approved"].includes(order.status)) {
      return res.status(400).json({
        message: "❌ Order is not ready for payment"
      })
    }

    /* ================= SAFE AMOUNT ================= */
    const baseAmount = Number(order.finalPrice || order.price || 0)

    console.log("💵 FINAL CHECK:", {
      price: order.price,
      finalPrice: order.finalPrice,
      parsed: baseAmount
    })

    if (!baseAmount || baseAmount <= 0) {
      return res.status(400).json({
        message: "❌ Price not set. Please approve first."
      })
    }

    const amount = Math.round(baseAmount * 100)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      metadata: {
        orderId: order._id.toString()
      },

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Order #${order._id}`
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],

      success_url: `${FRONTEND_URL}/success/${order._id}`,
      cancel_url: `${FRONTEND_URL}/cancel`
    })

    console.log("✅ STRIPE SESSION CREATED:", session.url)

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ STRIPE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= WEBHOOK ================= */
router.post("/webhook", async (req, res) => {
  console.log("🌐 WEBHOOK HIT")

  const sig = req.headers["stripe-signature"]

  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )

    console.log("🔥 EVENT:", event.type)

  } catch (err) {
    console.error("❌ SIGNATURE ERROR:", err.message)
    return res.status(400).send("Webhook Error")
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object

      const orderId = session.metadata?.orderId

      console.log("💰 PAYMENT SUCCESS:", orderId)

      if (!orderId) return res.sendStatus(200)

      const order = await Order.findById(orderId)

      if (!order) {
        console.log("❌ ORDER NOT FOUND:", orderId)
        return res.sendStatus(200)
      }

      if (order.status === "paid") {
        console.log("⚠️ ALREADY PAID:", orderId)
        return res.sendStatus(200)
      }

      /* 🔥 SAFE TIMELINE */
      if (!order.timeline) order.timeline = []

      /* ================= UPDATE ================= */
      order.status = "paid"

      order.timeline.push({
        status: "paid",
        date: new Date()
      })

      await order.save()

      console.log("✅ ORDER MARKED AS PAID:", orderId)

      /* ================= EMAIL ================= */
      if (order.email) {
        console.log("📧 SENDING PAID EMAIL:", order.email)

        await sendOrderStatusEmail(
          order.email,
          "paid",
          orderId,
          order
        )

        console.log("✅ EMAIL SENT")
      }

      /* 🔥 LIVE UPDATE */
      req.app.get("io")?.emit("jobUpdated", order)
    }

    res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err)
    res.sendStatus(500)
  }
})

export default router
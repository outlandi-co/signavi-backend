import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

dotenv.config()

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
})

const FRONTEND_URL = "http://localhost:5173"

/* ================= CHECKOUT ================= */
router.post("/create-checkout-session/:id", async (req, res) => {
  try {
    const { id } = req.params

    let order = await Order.findById(id)

    /* 🔥 AUTO CONVERT QUOTE */
    if (!order) {
      const quote = await Quote.findById(id)

      if (!quote) {
        return res.status(404).json({ message: "Not found" })
      }

      order = await Order.create({
  customerName: quote.customerName,
  email: (quote.email || "").toLowerCase().trim(), // 🔥 FIXED
        quantity: quote.quantity,
        printType: quote.printType,
        artwork: quote.artwork,
        price: quote.price,
        finalPrice: quote.price,
        items: quote.items || [],
        status: "payment_required",
        timeline: [{
          status: "payment_required",
          date: new Date(),
          note: "Auto-converted from quote"
        }]
      })

      await Quote.findByIdAndDelete(quote._id)

      req.app.get("io")?.emit("jobCreated", order)
      req.app.get("io")?.emit("jobDeleted", quote._id)
    }

    if (!["payment_required", "approved"].includes(order.status)) {
      return res.status(400).json({ message: "Not ready for payment" })
    }

    const amount = Math.round((order.finalPrice || order.price || 0) * 100)

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      metadata: {
        orderId: order._id.toString()
      },

      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Order #${order._id}` },
          unit_amount: amount
        },
        quantity: 1
      }],

      success_url: `${FRONTEND_URL}/success/${order._id}`,
      cancel_url: `${FRONTEND_URL}/cancel`
    })

    res.json({ url: session.url })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= WEBHOOK ================= */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"]

  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch {
    return res.status(400).send("Webhook Error")
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const orderId = session.metadata?.orderId

      const order = await Order.findById(orderId)
      if (!order) return res.sendStatus(200)

      if (!order.timeline) order.timeline = []

      order.status = "paid"
      order.productionStatus = "queued"

      order.timeline.push({
        status: "paid",
        date: new Date()
      })

      await order.save()

      req.app.get("io")?.emit("jobUpdated", order)

      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", orderId, order)
      }
    }

    res.sendStatus(200)

  } catch {
    res.sendStatus(500)
  }
})

export default router
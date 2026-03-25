import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

dotenv.config()

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* ⚠️ IMPORTANT: RAW BODY REQUIRED */
router.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"]

  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("❌ WEBHOOK SIGNATURE ERROR:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  /* ================= HANDLE EVENTS ================= */
  if (event.type === "checkout.session.completed") {
    const session = event.data.object

    const orderId = session.metadata?.orderId

    if (!orderId) {
      console.warn("⚠️ No orderId in metadata")
      return res.sendStatus(200)
    }

    const order = await Order.findById(orderId)

    if (!order) {
      console.warn("⚠️ Order not found:", orderId)
      return res.sendStatus(200)
    }

    /* 🔥 MARK AS PAID (SECURE) */
    order.status = "paid"
    order.timeline.push({
      status: "paid",
      date: new Date()
    })

    await order.save()

    console.log("💰 WEBHOOK PAYMENT CONFIRMED:", orderId)

    /* 🔥 SEND EMAIL */
    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "paid",
        order._id,
        order
      )
    }
  }

  res.sendStatus(200)
})

export default router
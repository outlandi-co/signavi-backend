import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

/* ================= STRIPE INIT ================= */
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ STRIPE_SECRET_KEY missing in .env")
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
})

/* ================= WEBHOOK ================= */
/* ⚠️ MUST USE express.raw() HERE */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    const sig = req.headers["stripe-signature"]

    if (!sig) {
      console.error("❌ Missing Stripe signature")
      return res.status(400).send("Missing signature")
    }

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
    try {

      if (event.type === "checkout.session.completed") {

        const session = event.data.object

        console.log("💳 Stripe payment completed:", session.id)

        /* ================= ORDER PAYMENT ================= */
        if (session.metadata?.orderId) {

          const orderId = session.metadata.orderId

          const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
              status: "production", // 🔥 AUTO MOVE
              paid: true
            },
            { new: true }
          )

          if (!updatedOrder) {
            console.warn("⚠️ Order not found for webhook:", orderId)
          } else {
            console.log("💰 ORDER PAID → MOVED TO PRODUCTION:", orderId)

            const io = req.app.get("io")

            if (io) {
              io.emit("jobUpdated", updatedOrder)
              io.emit("customerUpdated", updatedOrder)
            }
          }
        }

        /* ================= CART CHECKOUT ================= */
        if (session.metadata?.email) {
          console.log("🛒 Cart checkout complete:", session.metadata.email)

          // 🔮 FUTURE: create order automatically here
        }
      }

      res.json({ received: true })

    } catch (err) {
      console.error("❌ WEBHOOK HANDLER ERROR:", err)
      res.status(500).send("Webhook handler failed")
    }
  }
)

export default router
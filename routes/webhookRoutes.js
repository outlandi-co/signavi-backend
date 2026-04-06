import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

dotenv.config()

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
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

  try {

    /* ================= CHECKOUT COMPLETE ================= */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const orderId = session.metadata?.orderId

      console.log("💰 PAYMENT COMPLETE:", session.id)

      if (!orderId) {
        console.log("⚠️ Missing orderId")
        return res.sendStatus(200)
      }

      const order = await Order.findById(orderId)

      if (!order) {
        console.log("❌ Order not found:", orderId)
        return res.sendStatus(200)
      }

      if (order.status === "paid") {
        console.log("⚠️ Already processed")
        return res.sendStatus(200)
      }

      if (!order.timeline) order.timeline = []

      order.status = "paid"
      order.productionStatus = "queued"

      order.stripeSessionId = session.id
      order.stripePaymentIntentId = session.payment_intent
      order.amountReceived = session.amount_total

      order.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment received via Stripe"
      })

      await order.save()

      console.log("✅ ORDER MARKED PAID:", orderId)

      /* 🔥 REAL-TIME UPDATE */
      req.app.get("io")?.emit("jobUpdated", order)

      /* 🔥 EMAIL */
      if (order.email) {
        try {
          await sendOrderStatusEmail(order.email, "paid", order._id, order)
        } catch (err) {
          console.error("⚠️ Email failed:", err.message)
        }
      }
    }

    /* ================= CHARGE SUCCEEDED ================= */
    if (event.type === "charge.succeeded") {
      const charge = event.data.object

      const order = await Order.findOne({
        stripePaymentIntentId: charge.payment_intent
      })

      if (!order) return res.sendStatus(200)

      if (order.stripeChargeId) return res.sendStatus(200)

      const balanceTx = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction
      )

      order.stripeChargeId = charge.id
      order.stripeFee = balanceTx.fee
      order.netAmount = balanceTx.net

      await order.save()

      console.log("💵 FEES STORED:", order._id)
    }

    res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK PROCESS ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
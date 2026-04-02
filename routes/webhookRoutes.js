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
    console.error("❌ WEBHOOK ERROR:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {

    /* ================= CHECKOUT COMPLETE ================= */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const orderId = session.metadata?.orderId

      const order = await Order.findById(orderId)
      if (!order) return res.sendStatus(200)

      order.status = "paid"
      order.stripeSessionId = session.id
      order.stripePaymentIntentId = session.payment_intent
      order.amountReceived = session.amount_total

      order.timeline.push({
        status: "paid",
        date: new Date()
      })

      await order.save()

      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
      }
    }

    /* ================= CHARGE SUCCEEDED ================= */
    if (event.type === "charge.succeeded") {
      const charge = event.data.object

      const order = await Order.findOne({
        stripePaymentIntentId: charge.payment_intent
      })

      if (!order) return res.sendStatus(200)

      const balanceTx = await stripe.balanceTransactions.retrieve(
        charge.balance_transaction
      )

      order.stripeChargeId = charge.id
      order.stripeFee = balanceTx.fee
      order.netAmount = balanceTx.net

      await order.save()
    }

    res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK PROCESS ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
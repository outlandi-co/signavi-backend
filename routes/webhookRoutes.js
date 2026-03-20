import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* STRIPE WEBHOOK */

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

    console.error("Webhook signature verification failed:", err.message)

    return res.status(400).send(`Webhook Error: ${err.message}`)

  }

  /* PAYMENT SUCCESS */

  if (event.type === "checkout.session.completed") {

    const session = event.data.object

    try {

      const items = session.metadata?.items
        ? JSON.parse(session.metadata.items)
        : []

      const total = session.amount_total
        ? session.amount_total / 100
        : 0

      const order = await Order.create({
        items,
        total,
        stripeSessionId: session.id
      })

      console.log("Order saved from Stripe webhook:", order._id)

    } catch (err) {

      console.error("Order creation failed:", err)

    }

  }

  res.json({ received: true })

})

export default router
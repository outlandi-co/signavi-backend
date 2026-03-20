import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

/* ================= STRIPE INIT ================= */

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY in .env")
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10"
})

/* ========================================================= */
/* ================= STORE CHECKOUT ========================= */
/* ========================================================= */

router.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invalid items" })
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name || "Product"
        },
        unit_amount: Math.round(Number(item.price || 0) * 100)
      },
      quantity: Number(item.quantity || 1)
    }))

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,

      /* 🔥 SAVE CART */
      metadata: {
        type: "store",
        items: JSON.stringify(items).slice(0, 5000) // prevent overflow
      },

      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/store"
    })

    console.log("✅ Stripe session created:", session.id)

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ Store checkout error:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ========================================================= */
/* ================= QUOTE CHECKOUT ========================= */
/* ========================================================= */

router.post("/create-quote-checkout/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" })
    }

    const total = quote.price + (quote.cleanupFee || 0)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Custom Print Order",
              description: quote.adminNotes || "Custom order"
            },
            unit_amount: Math.round(total * 100)
          },
          quantity: 1
        }
      ],

      metadata: {
        type: "quote",
        quoteId: quote._id.toString()
      },

      success_url: `http://localhost:5173/success/${quote._id}`,
      cancel_url: `http://localhost:5173/quote/${quote._id}`
    })

    console.log("✅ Quote session created:", session.id)

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ Quote checkout error:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ========================================================= */
/* ================= STRIPE WEBHOOK ========================= */
/* ========================================================= */

router.post("/webhook", async (req, res) => {
  console.log("🔥 WEBHOOK HIT")

  const sig = req.headers["stripe-signature"]

  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("❌ Signature failed:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  console.log("✅ Event:", event.type)

  if (event.type === "checkout.session.completed") {
    const session = event.data.object
    const type = session.metadata?.type

    /* ================= STORE ORDER ================= */
    if (type === "store") {
      try {
        const items = session.metadata?.items
          ? JSON.parse(session.metadata.items)
          : []

        const total = session.amount_total
          ? session.amount_total / 100
          : 0

        const order = await Order.create({
          orderId: "SNV-" + Date.now(),
          items,
          total,
          stripeSessionId: session.id,
          status: "pending"
        })

        console.log("🛒 Store order saved:", order._id)

      } catch (err) {
        console.error("❌ Store order failed:", err)
      }
    }

    /* ================= QUOTE ORDER ================= */
    if (type === "quote") {
      try {
        const quoteId = session.metadata.quoteId

        const quote = await Quote.findById(quoteId)

        if (!quote) {
          console.error("Quote not found:", quoteId)
          return res.status(200).end()
        }

        if (quote.customerAccepted) {
          console.log("⚠️ Already processed:", quoteId)
          return res.status(200).end()
        }

        quote.customerAccepted = true
        quote.status = "approved"
        quote.acceptedAt = new Date()

        await quote.save()

        const total = quote.price + (quote.cleanupFee || 0)

        await Order.create({
          orderId: "SNV-" + Date.now(),
          items: [
            {
              name: "Custom Print",
              price: total,
              quantity: quote.quantity
            }
          ],
          total,
          status: "pending"
        })

        console.log("🎯 Quote order created")

      } catch (err) {
        console.error("❌ Quote processing failed:", err)
      }
    }
  }

  res.json({ received: true })
})

export default router
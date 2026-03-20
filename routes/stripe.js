import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"

dotenv.config()

const router = express.Router()

/* ------------------ STRIPE INIT ------------------ */

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY in .env")
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10"
})

/* ------------------ CREATE CHECKOUT SESSION ------------------ */

router.post("/create-checkout-session", async (req, res) => {

  try {

    const { items } = req.body

    console.log("Incoming checkout request:", items)

    /* ------------------ VALIDATION ------------------ */

    if (!items || !Array.isArray(items) || items.length === 0) {

      return res.status(400).json({
        error: "No items provided"
      })

    }

    /* ------------------ BUILD LINE ITEMS ------------------ */

    const line_items = items.map(item => {

      const price = Number(item.price)

      if (!price || isNaN(price)) {
        throw new Error(`Invalid price for item: ${item.name}`)
      }

      return {

        price_data: {

          currency: "usd",

          product_data: {
            name: item.name || "Product"
          },

          unit_amount: Math.round(price * 100) // Stripe requires cents

        },

        quantity: Number(item.quantity) || 1

      }

    })

    /* ------------------ CREATE STRIPE SESSION ------------------ */

    const session = await stripe.checkout.sessions.create({

      payment_method_types: ["card"],

      mode: "payment",

      line_items,

      metadata: {
        items: JSON.stringify(items)
      },

      success_url: "http://localhost:5173/success",

      cancel_url: "http://localhost:5173/products"

    })

    console.log("Stripe session created:", session.id)

    res.status(200).json({
      url: session.url
    })

  }

  catch (error) {

    console.error("Stripe checkout error:", error)

    res.status(500).json({
      error: "Stripe checkout failed",
      message: error.message
    })

  }

})

export default router
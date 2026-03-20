import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"

dotenv.config()

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

router.post("/create-checkout-session", async (req, res) => {

  try {

    const { items } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" })
    }

    console.log("Checkout items received:", items)

    const session = await stripe.checkout.sessions.create({

      payment_method_types: ["card"],

      mode: "payment",

      line_items: items.map(item => ({

        price_data: {

          currency: "usd",

          product_data: {
            name: item.name
          },

          unit_amount: Math.round(item.price * 100)

        },

        quantity: item.quantity

      })),

      /*
      Send minimal cart data to Stripe metadata
      This prevents metadata size issues
      */

      metadata: {

        items: JSON.stringify(
          items.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity
          }))
        )

      },

      success_url: "http://localhost:5173/success",

      cancel_url: "http://localhost:5173/cart"

    })

    res.json({ url: session.url })

  } catch (error) {

    console.error("Stripe checkout error:", error)

    res.status(500).json({ error: "Checkout failed" })

  }

})

export default router
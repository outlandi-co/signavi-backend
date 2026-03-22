import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"

dotenv.config()

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

router.post("/create-checkout-session", async (req, res) => {
  try {
    const { items, customer = {} } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" })
    }

    console.log("🟢 Checkout items received:", items)
    console.log("🟢 Customer:", customer)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      line_items: items.map(item => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name || "Product"
          },
          unit_amount: Math.round((item.price || 0) * 100)
        },
        quantity: item.quantity || 1
      })),

      /* ✅ FIX: use undefined instead of "" */
      customer_email: customer.email || undefined,

      metadata: {
        items: JSON.stringify(items).slice(0, 5000),
        customerName: customer.name || "Store Order"
      },

      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/cart"
    })

    console.log("✅ Stripe session created:", session.id)

    res.json({ url: session.url })

  } catch (error) {
    console.error("❌ Stripe checkout error:", error.message)
    res.status(500).json({ error: error.message })
  }
})

export default router
import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
})

/* ✅ FORCE CORRECT DOMAIN */
const CLIENT_URL =
  process.env.CLIENT_URL || "https://signavi-studio.netlify.app"

/* ================= CART CHECKOUT ================= */
router.post("/create-cart-session", async (req, res) => {
  try {
    const { items } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" })
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name || "Item"
        },
        unit_amount: Math.round(Number(item.price || 0) * 100)
      },
      quantity: Number(item.quantity || 1)
    }))

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      success_url: `${CLIENT_URL}/store?success=true`,
      cancel_url: `${CLIENT_URL}/store?canceled=true`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ STRIPE CART ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= ORDER CHECKOUT ================= */
router.post("/create-order-session/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: order.items.map(item => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name || "Item"
          },
          unit_amount: Math.round(Number(item.price || 0) * 100)
        },
        quantity: Number(item.quantity || 1)
      })),

      success_url: `${CLIENT_URL}/store?success=true`,
      cancel_url: `${CLIENT_URL}/store?canceled=true`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ ORDER SESSION ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
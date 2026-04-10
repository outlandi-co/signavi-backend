import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* 🔥 FORCE PRODUCTION URL */
const CLIENT_URL =
  process.env.CLIENT_URL || "https://signavistudio.store"

/* ================= CART ================= */
router.post("/create-cart-session", async (req, res) => {
  try {
    const { items } = req.body

    const line_items = items.map(item => ({
      price_data: {
        currency: "usd",
        tax_behavior: "exclusive",
        product_data: {
          name: item.name,
          tax_code: "txcd_20030000"
        },
        unit_amount: Math.round(Number(item.price || 0) * 100)
      },
      quantity: Number(item.quantity || 1)
    }))

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      automatic_tax: { enabled: true },

      billing_address_collection: "required",

      shipping_address_collection: {
        allowed_countries: ["US"]
      },

      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 599, currency: "usd" },
            display_name: "Standard Shipping"
          }
        }
      ],

      success_url: `${CLIENT_URL}/success`,
      cancel_url: `${CLIENT_URL}/cart`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= ORDER ================= */
router.post("/create-order-session/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      line_items: order.items.map(item => ({
        price_data: {
          currency: "usd",
          tax_behavior: "exclusive",
          product_data: {
            name: item.name,
            tax_code: "txcd_20030000"
          },
          unit_amount: Math.round(Number(item.price || 0) * 100)
        },
        quantity: item.quantity
      })),

      automatic_tax: { enabled: true },

      billing_address_collection: "required",

      shipping_address_collection: {
        allowed_countries: ["US"]
      },

      success_url: `${CLIENT_URL}/success`,
      cancel_url: `${CLIENT_URL}/cart`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

export default router
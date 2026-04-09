// routes/stripe.js

import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

/* ================= ENV SAFETY ================= */
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ STRIPE_SECRET_KEY missing in .env")
}

/* 🔥 CLIENT URL (PRODUCTION + LOCAL SAFE) */
const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
})

/* =========================================================
   🛒 CREATE CART CHECKOUT SESSION
========================================================= */
router.post("/create-cart-session", async (req, res) => {
  try {
    const { items } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" })
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: "usd",
        tax_behavior: "exclusive",

        product_data: {
          name: item.name || "Item",
          tax_code: "txcd_20030000"
        },

        unit_amount: Math.round(Number(item.price || 0) * 100)
      },
      quantity: Number(item.quantity || 1)
    }))

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,

      automatic_tax: { enabled: true },

      tax_id_collection: {
        enabled: false
      },

      billing_address_collection: "required",

      shipping_address_collection: {
        allowed_countries: ["US"]
      },

      customer_creation: "always",

      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            tax_behavior: "exclusive",
            fixed_amount: {
              amount: 599,
              currency: "usd"
            },
            display_name: "Standard Shipping (3–5 days)"
          }
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            tax_behavior: "exclusive",
            fixed_amount: {
              amount: 1299,
              currency: "usd"
            },
            display_name: "Express Shipping (1–2 days)"
          }
        }
      ],

      phone_number_collection: { enabled: true },

      metadata: {
        type: "cart",
        tax_code: "txcd_20030000"
      },

      /* 🔥 FIXED URLS */
      success_url: `${CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/cart`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ STRIPE CART ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 CREATE ORDER CHECKOUT SESSION
========================================================= */
router.post("/create-order-session/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (!order.items || order.items.length === 0) {
      return res.status(400).json({ message: "Order has no items" })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: order.items.map(item => ({
        price_data: {
          currency: "usd",
          tax_behavior: "exclusive",
          product_data: {
            name: item.name || "Item",
            tax_code: "txcd_20030000"
          },
          unit_amount: Math.round(Number(item.price || 0) * 100)
        },
        quantity: Number(item.quantity || 1)
      })),

      automatic_tax: { enabled: true },

      billing_address_collection: "required",

      shipping_address_collection: {
        allowed_countries: ["US"]
      },

      customer_creation: "always",

      metadata: {
        orderId: order._id.toString(),
        tax_code: "txcd_20030000"
      },

      /* 🔥 FIXED URLS */
      success_url: `${CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/cart`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ ORDER SESSION ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
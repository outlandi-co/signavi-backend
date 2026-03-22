import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Product from "../models/Product.js" // 🔥 NEW

dotenv.config()

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* ================= CREATE CHECKOUT ================= */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { items, customer = {}, discountPercent } = req.body

    /* 🔥 FETCH PRODUCTS TO GET COST */
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.productId).lean()

        return {
          ...item,
          cost: product?.cost || 0 // 🔥 REAL COST
        }
      })
    )

    /* ================= STRIPE LINE ITEMS ================= */
    const line_items = enrichedItems.map(item => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name
        },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity
    }))

    /* ================= DISCOUNT ================= */
    let discounts = []

    if (discountPercent) {
      const coupon = await stripe.coupons.create({
        percent_off: discountPercent,
        duration: "once"
      })

      discounts = [{ coupon: coupon.id }]
    }

    /* ================= CREATE SESSION ================= */
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      discounts,
      customer_email: customer.email || undefined,

      metadata: {
        type: "store",
        customerName: customer.name || "Store Order",
        items: JSON.stringify(enrichedItems) // 🔥 STORE COST HERE
      },

      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/store"
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ Stripe error:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
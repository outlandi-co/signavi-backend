import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"

dotenv.config()

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* ================= CALCULATE TAX ================= */
router.post("/calculate", async (req, res) => {
  try {
    const { zip, subtotal } = req.body

    console.log("📦 TAX REQUEST:", { zip, subtotal })

    if (!zip || !subtotal) {
      return res.json({ tax: 0 })
    }

    const calculation = await stripe.tax.calculations.create({
      currency: "usd",

      customer_details: {
        address: {
          country: "US",
          state: "CA",            // 🔥 THIS FIXES EVERYTHING
          postal_code: zip
        },
        address_source: "shipping"
      },

      line_items: [
        {
          amount: Math.round(Number(subtotal) * 100),
          reference: "cart",
          tax_behavior: "exclusive"
        }
      ]
    })

    console.log("✅ STRIPE TAX CALC:", calculation)

    res.json({
      tax: calculation.tax_amount_exclusive || 0
    })

  } catch (err) {
    console.error("❌ TAX ERROR:", err)
    res.json({ tax: 0 })
  }
})

export default router
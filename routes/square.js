import express from "express"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"

const router = express.Router()

/* ================= ENV ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

/* =========================================================
   💳 CREATE PAYMENT LINK (FINAL)
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CREATE PAYMENT:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    // 🔥 SAFE PRICE
    let price = Number(quote.price || 25)
    if (!price || price <= 0) {
      console.warn("⚠️ Invalid price → fallback 25")
      price = 25
    }

    const amount = Math.round(price * 100)

    console.log("💰 FINAL AMOUNT:", amount)

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Quote #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount,
              currency: "USD"
            }
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${id}`
      }
    })

    const url = response?.paymentLink?.url

    console.log("🔗 PAYMENT URL:", url)

    if (!url) {
      return res.status(500).json({ message: "No payment URL returned" })
    }

    return res.json({ url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

export default router
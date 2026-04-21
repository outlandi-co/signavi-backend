import express from "express"
import { Client, Environment } from "square"
import Quote from "../models/Quote.js"

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production // or Sandbox if testing
})

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    const amount = Math.round(Number(quote.price) * 100)

    const response = await client.checkout.paymentLinks.create({
  idempotencyKey: `${quote._id}-${Date.now()}`,

  order: {
    locationId: process.env.SQUARE_LOCATION_ID,

    /* 🔥 CRITICAL FOR WEBHOOK */
    metadata: {
      quoteId: String(quote._id)
    },

    lineItems: [
      {
        name: `Order #${quote._id}`,
        quantity: "1",
        basePriceMoney: {
          amount: Math.round(Number(quote.price) * 100),
          currency: "USD"
        }
      }
    ]
  }
})

    const url = response?.result?.paymentLink?.url

    if (!url) {
      throw new Error("No payment link returned from Square")
    }

    /* 🔥 SAVE TO DB */
    quote.paymentUrl = url
    await quote.save()

    console.log("💳 PAYMENT LINK CREATED:", url)

    return res.json({ success: true, url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

export default router
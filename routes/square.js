import express from "express"
import { Client, Environment } from "square"
import Quote from "../models/Quote.js"

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production
})

/* =========================================================
   💳 CREATE PAYMENT LINK (FIXED)
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  console.log("🔥 CREATE PAYMENT HIT")

  try {
    const { id } = req.params

    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      throw new Error("Missing Square ENV variables")
    }

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    const amount = Math.round(price * 100)

    console.log("💰 AMOUNT:", amount)

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount,
              currency: "USD"
            }
          }
        ]
      }
    })

    const url = response?.result?.paymentLink?.url

    if (!url) {
      throw new Error("No payment URL returned from Square")
    }

    /* 🔥 SAVE LINK TO DB */
    quote.paymentUrl = url
    await quote.save()

    console.log("✅ PAYMENT LINK:", url)

    return res.json({
      success: true,
      url
    })

  } catch (err) {
    console.error("❌ CREATE PAYMENT ERROR:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

export default router
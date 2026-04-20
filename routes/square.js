import express from "express"
import pkg from "square"
import Quote from "../models/Quote.js"

const { Client } = pkg

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production"
})

router.post("/create-payment/:id", async (req, res) => {
  console.log("💳 CREATE PAYMENT:", req.params.id)

  try {
    const { id } = req.params

    const quote = await Quote.findById(id)
    if (!quote) throw new Error("Quote not found")

    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    /* 🔥 FORCE BIGINT (THIS IS THE FIX) */
    const rawAmount = Math.round(price * 100)
    const amount = BigInt(rawAmount)

    console.log("💰 RAW:", rawAmount)
    console.log("💰 FINAL TYPE:", typeof amount, amount.toString())

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount, // ✅ MUST BE BIGINT
              currency: "USD"
            }
          }
        ]
      }
    })

    const url = response?.result?.paymentLink?.url

    if (!url) throw new Error("No payment URL returned")

    quote.paymentUrl = url
    await quote.save()

    console.log("✅ PAYMENT LINK:", url)

    res.json({ success: true, url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
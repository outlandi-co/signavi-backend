import express from "express"
import { Client, Environment } from "square"
import Quote from "../models/Quote.js"

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production
})

router.post("/create-payment/:id", async (req, res) => {
  console.log("💳 CREATE PAYMENT:", req.params.id)

  try {
    const { id } = req.params

    const quote = await Quote.findById(id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    /* 🔥 FIX */
    const amount = BigInt(Math.round(price * 100))

    console.log("💰 AMOUNT TYPE:", typeof amount, amount.toString())

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount,
              currency: "USD"
            }
          }
        ]
      }
    })

    const url = response?.result?.paymentLink?.url
    if (!url) throw new Error("No payment URL")

    quote.paymentUrl = url
    await quote.save()

    res.json({ success: true, url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
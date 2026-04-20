import express from "express"
import pkg from "square"
import Quote from "../models/Quote.js"

const { Client, Environment } = pkg

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production
})

router.post("/create-payment/:id", async (req, res) => {
  console.log("💳 CREATE PAYMENT:", req.params.id)

  try {
    const { id } = req.params

    /* ================= ENV CHECK ================= */
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      throw new Error("Missing Square ENV variables")
    }

    /* ================= FIND QUOTE ================= */
    const quote = await Quote.findById(id)

    if (!quote) {
      throw new Error("Quote not found")
    }

    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    /* ================= BIGINT FIX ================= */
    const amount = BigInt(Math.round(price * 100))

    console.log("💰 AMOUNT TYPE:", typeof amount, amount.toString())

    /* ================= SQUARE REQUEST ================= */
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

    console.log("🧪 RAW RESPONSE:", JSON.stringify(response, null, 2))

    const url = response?.result?.paymentLink?.url

    if (!url) {
      throw new Error("Square did not return payment URL")
    }

    /* ================= SAVE ================= */
    quote.paymentUrl = url
    await quote.save()

    console.log("✅ PAYMENT LINK:", url)

    return res.json({ success: true, url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR FULL:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

export default router
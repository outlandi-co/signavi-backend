import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"

const router = express.Router()

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
})

router.post("/create-payment/:id", async (req, res) => {
  console.log("💳 CREATE PAYMENT:", req.params.id)

  try {
    const { id } = req.params

    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      throw new Error("Missing Square environment variables")
    }

    const quote = await Quote.findById(id)
    if (!quote) throw new Error("Quote not found")

    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    const amountNumber = Math.round(price * 100)
    const amountBigInt = BigInt(amountNumber)

    console.log("💰 SAFE NUMBER:", amountNumber)

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount: amountBigInt, // ✅ ONLY HERE
              currency: "USD"
            }
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL || "https://signavistudio.store"}/success`
      }
    })

    const url =
      response?.paymentLink?.url ||
      response?.result?.paymentLink?.url

    if (!url) throw new Error("No payment URL returned")

    quote.paymentUrl = url
    await quote.save()

    console.log("✅ PAYMENT LINK:", url)

    // ✅ IMPORTANT: NEVER send BigInt in response
    return res.json({
      success: true,
      url
    })

  } catch (err) {
  console.error("❌ PAYMENT ERROR FULL:", err)
  console.error("❌ STACK:", err.stack)

  return res.status(500).json({
    message: err.message,
    stack: err.stack // 👈 TEMP DEBUG
  })
}
})

export default router
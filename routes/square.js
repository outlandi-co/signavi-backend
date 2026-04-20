import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= SQUARE CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
})

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  console.log("💳 CREATE PAYMENT:", req.params.id)

  try {
    const { id } = req.params

    /* ================= ENV CHECK ================= */
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      throw new Error("Missing Square environment variables")
    }

    /* ================= FIND QUOTE ================= */
    const quote = await Quote.findById(id)
    if (!quote) throw new Error("Quote not found")

    /* ================= PRICE ================= */
    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    /* ================= BIGINT FIX (FINAL) ================= */
    const rawAmount = Math.round(price * 100)
    const amount = BigInt(rawAmount)

    console.log("💰 RAW:", rawAmount)
    console.log("💰 TYPE:", typeof amount, amount.toString())

    /* ================= BUILD LINE ITEM ================= */
    const lineItem = {
      name: `Order #${id}`,
      quantity: "1",
      basePriceMoney: {
        amount: amount, // 🔥 MUST BE BIGINT
        currency: "USD",
      },
    }

    console.log("🧪 LINE ITEM:", lineItem)

    /* ================= CREATE PAYMENT LINK ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [lineItem],
      },
    })

    console.log("🧪 RAW RESPONSE:", JSON.stringify(response, null, 2))

    /* ================= GET URL ================= */
    const url =
      response?.paymentLink?.url ||
      response?.result?.paymentLink?.url

    if (!url) throw new Error("No payment URL returned from Square")

    /* ================= SAVE ================= */
    quote.paymentUrl = url
    await quote.save()

    console.log("✅ PAYMENT LINK:", url)

    return res.json({
      success: true,
      url,
    })

  } catch (err) {
    console.error("❌ PAYMENT ERROR FULL:", err)

    return res.status(500).json({
      message: err.message,
    })
  }
})

export default router
import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED (FIXED)")

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CREATE PAYMENT:", id)

    /* ================= FIND RECORD ================= */
    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      return res.status(404).json({ message: "Not found" })
    }

    console.log("📦 TYPE:", type)

    /* ================= PRICE ================= */
    const subtotal = Number(record.subtotal || record.price || 0)
    const tax = Number(record.tax || 0)

    if (!subtotal || subtotal <= 0) {
      throw new Error("Invalid subtotal")
    }

    console.log("💰 SUBTOTAL:", subtotal)
    console.log("💰 TAX:", tax)

    /* ================= CREATE PAYMENT ================= */
    const response = await client.checkout.paymentLinksApi.createPaymentLink({
      idempotencyKey: `${id}-${Date.now()}`,

      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        metadata: {
          recordId: String(record._id),
          type
        },

        lineItems: [
          {
            name: "Subtotal",
            quantity: "1",
            basePriceMoney: {
              amount: Math.round(subtotal * 100),
              currency: "USD"
            }
          },
          {
            name: "Tax",
            quantity: "1",
            basePriceMoney: {
              amount: Math.round(tax * 100),
              currency: "USD"
            }
          }
        ]
      },

      /* 🔥 REQUIRED — THIS FIXES 500 + REDIRECT */
      checkoutOptions: {
        redirectUrl: `${
          process.env.CLIENT_URL || "https://signavistudio.store"
        }/success/${id}`
      }
    })

    console.log("🧪 SQUARE RESPONSE:", JSON.stringify(response, null, 2))

    const url =
      response?.result?.paymentLink?.url ||
      response?.paymentLink?.url

    if (!url) {
      throw new Error("Square did not return a payment URL")
    }

    /* ================= SAVE ================= */
    record.paymentUrl = url
    await record.save()

    console.log("✅ PAYMENT LINK:", url)

    return res.json({
      success: true,
      url
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

export default router
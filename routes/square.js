import express from "express"
import pkg from "square"

const { Client } = pkg

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED (FINAL WORKING VERSION)")

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production" // or "sandbox"
})

router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CREATE PAYMENT:", id)

    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      throw new Error("Record not found")
    }

    const subtotal = Number(record.subtotal || record.price || 0)

    if (!subtotal || isNaN(subtotal)) {
      throw new Error("Invalid subtotal")
    }

    const tax = subtotal * 0.0825

    console.log("💰 SUBTOTAL:", subtotal)
    console.log("💰 TAX:", tax)

    const response = await client.checkoutApi.createPaymentLink({
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

      checkoutOptions: {
        redirectUrl: `${
          process.env.CLIENT_URL || "https://signavistudio.store"
        }/success/${id}`
      }
    })

    console.log("🧪 FULL RESPONSE:", response)

    let url = response?.result?.paymentLink?.url

    if (!url) {
      throw new Error("No payment URL returned")
    }

    // 🔥 FIX BAD URL IF EVER PRESENT
    if (url.startsWith("ttps://")) {
      url = "h" + url
    }

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
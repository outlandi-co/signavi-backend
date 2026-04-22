import express from "express"
import { SquareClient } from "square"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED (FINAL FIXED)")

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
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
      throw new Error("Record not found")
    }

    console.log("📦 TYPE:", type)

    /* ================= PRICE ================= */
    const subtotal = Number(record.subtotal || record.price || 0)

    if (!subtotal || isNaN(subtotal)) {
      throw new Error("Invalid subtotal")
    }

    const tax = subtotal * 0.0825

    console.log("💰 SUBTOTAL:", subtotal)
    console.log("💰 TAX:", tax)

    /* ================= FIXED METHOD ================= */
    const response = await client.checkout.paymentLinks.create({
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

    console.log("🧪 RESPONSE:", response)

    const url = response?.paymentLink?.url

    if (!url) {
      throw new Error("No payment URL returned")
    }

    /* 🔥 SANITIZE */
    let safeUrl = url

    if (safeUrl.startsWith("ttps://")) {
      safeUrl = "h" + safeUrl
    }

    if (!safeUrl.startsWith("http")) {
      safeUrl = `https://${safeUrl}`
    }

    /* ================= SAVE ================= */
    record.paymentUrl = safeUrl
    await record.save()

    console.log("✅ PAYMENT LINK:", safeUrl)

    return res.json({
      success: true,
      url: safeUrl
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR FULL:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

export default router
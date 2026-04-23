import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED (PRO VERSION)")

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

/* =========================================================
   💳 CREATE PAYMENT LINK (FINAL VERSION)
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CREATE PAYMENT:", id)

    /* ================= ENV CHECK ================= */
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      throw new Error("Missing SQUARE_ACCESS_TOKEN")
    }

    if (!process.env.SQUARE_LOCATION_ID) {
      throw new Error("Missing SQUARE_LOCATION_ID")
    }

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

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
    const amountValue =
      Number(record.finalPrice) ||
      Number(record.price) ||
      0

    if (!amountValue || isNaN(amountValue)) {
      throw new Error("Invalid price")
    }

    console.log("💰 FINAL PRICE:", amountValue)

    /* 🔥 BigInt required */
    const amountCents = BigInt(Math.round(amountValue * 100))

    /* ================= CREATE PAYMENT ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,

      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        metadata: {
          recordId: String(record._id),
          type
        },

        /* 🔥 SINGLE FINAL PRICE ITEM (NO DOUBLE TAX) */
        lineItems: [
          {
            name: `${type.toUpperCase()} #${record._id}`,
            quantity: "1",
            basePriceMoney: {
              amount: amountCents,
              currency: "USD"
            }
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${CLIENT_URL}/success/${id}`
      }
    })

    console.log("🧪 SQUARE RESPONSE RECEIVED")

    let url = response?.paymentLink?.url

    if (!url) {
      throw new Error("No payment URL returned from Square")
    }

    /* ================= SANITIZE ================= */
    if (url.startsWith("ttps://")) {
      url = "h" + url
    }

    if (!url.startsWith("http")) {
      url = `https://${url}`
    }

    /* ================= SAVE ================= */
    record.paymentUrl = url
    await record.save()

    console.log("✅ PAYMENT LINK:", url)

    return res.json({
      success: true,
      url,
      orderId: record._id
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR FULL:", err)

    return res.status(500).json({
      message: err.message,
      details: err?.errors || null
    })
  }
})

export default router
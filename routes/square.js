import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED (TAX FIXED VERSION)")

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

/* =========================================================
   💳 CREATE PAYMENT LINK (WITH REAL TAX)
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

    console.log("🔍 ENV OK")

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
    const subtotal = Number(record.price || 0)

    if (!subtotal || isNaN(subtotal)) {
      throw new Error("Invalid subtotal")
    }

    console.log("💰 SUBTOTAL:", subtotal)

    /* 🔥 BIGINT REQUIRED */
    const subtotalCents = BigInt(Math.round(subtotal * 100))

    console.log("💰 CENTS:", {
      subtotalCents: subtotalCents.toString()
    })

    /* ================= CREATE PAYMENT ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,

      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        metadata: {
          recordId: String(record._id),
          type
        },

        /* ✅ ONLY SUBTOTAL AS ITEM */
        lineItems: [
          {
            name: `${type.toUpperCase()} Order`,
            quantity: "1",
            basePriceMoney: {
              amount: subtotalCents,
              currency: "USD"
            }
          }
        ],

        /* 🔥 REAL TAX SYSTEM */
        taxes: [
          {
            name: "Sales Tax",
            percentage: "8.25", // 🔥 STRING REQUIRED
            scope: "ORDER"
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${
          process.env.CLIENT_URL || "https://signavistudio.store"
        }/success/${id}`
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
      url
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
import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED (FINAL HARDENED)")

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

/* =========================================================
   💳 CREATE PAYMENT LINK (STABLE + DEBUG)
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

    const tax = subtotal * 0.0825

    console.log("💰 SUBTOTAL:", subtotal)
    console.log("💰 TAX:", tax)

    /* 🔥 FIX: BIGINT REQUIRED */
    const subtotalCents = BigInt(Math.round(subtotal * 100))
    const taxCents = BigInt(Math.round(tax * 100))

    console.log("💰 CENTS:", {
      subtotalCents: subtotalCents.toString(),
      taxCents: taxCents.toString()
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

        lineItems: [
          {
            name: "Subtotal",
            quantity: "1",
            basePriceMoney: {
              amount: subtotalCents, // ✅ BIGINT
              currency: "USD"
            }
          },
          {
            name: "Tax",
            quantity: "1",
            basePriceMoney: {
              amount: taxCents, // ✅ BIGINT
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
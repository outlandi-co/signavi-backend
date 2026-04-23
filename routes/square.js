import express from "express"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= ENV MODE ================= */
const isProd = process.env.NODE_ENV === "production"

console.log(
  `💳 SQUARE ROUTE LOADED → ${isProd ? "PRODUCTION" : "SANDBOX"} MODE`
)

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: isProd
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox
})

/* =========================================================
   💳 CREATE PAYMENT LINK (SANDBOX + PROD READY)
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
      process.env.CLIENT_URL || "http://localhost:5173"

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

        /* 🔥 SINGLE FINAL PRICE ITEM */
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

    console.log(
      "🌐 PAYMENT URL:",
      url.includes("sandbox") ? "SANDBOX LINK" : "PRODUCTION LINK"
    )

    /* ================= SAVE ================= */
    record.paymentUrl = url
    await record.save()

    console.log("✅ PAYMENT LINK SAVED")

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
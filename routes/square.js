import express from "express"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED → SANDBOX MODE")

/* ================= CLIENT (SANDBOX ONLY) ================= */
const client = new SquareClient({
  token: process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
  environment: SquareEnvironment.Sandbox
})

/* ================= LOCATION ================= */
const LOCATION_ID = process.env.SQUARE_SANDBOX_LOCATION_ID

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CREATE PAYMENT:", id)

    /* 🔥 ENV CHECK */
    if (!process.env.SQUARE_SANDBOX_ACCESS_TOKEN) {
      throw new Error("Missing SQUARE_SANDBOX_ACCESS_TOKEN")
    }

    if (!process.env.SQUARE_SANDBOX_LOCATION_ID) {
      throw new Error("Missing SQUARE_SANDBOX_LOCATION_ID")
    }

    const CLIENT_URL =
      process.env.CLIENT_URL || "http://localhost:5173"

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
    let amountValue = 0

    if (type === "quote") {
      const subtotal = Number(record.price || 0)
      const shipping = Number(record.shippingCost || 0)

      const TAX_RATE = 0.0825
      const tax = subtotal * TAX_RATE

      amountValue = subtotal + shipping + tax
    } else {
      amountValue =
        Number(record.finalPrice) ||
        Number(record.price) ||
        0
    }

    console.log("💰 CALCULATED:", amountValue)

    if (!amountValue || isNaN(amountValue)) {
      throw new Error("Invalid price calculation")
    }

    /* 🔥 FIX: ALWAYS SAFE BIGINT */
    const amountCents = BigInt(Math.round(amountValue * 100))

    console.log("💰 CENTS:", amountCents.toString())

    /* ================= CREATE PAYMENT ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,

      order: {
        locationId: LOCATION_ID,

        metadata: {
          recordId: String(record._id),
          type
        },

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

    let url = response?.paymentLink?.url

    if (!url) throw new Error("No payment URL returned")

    if (!url.startsWith("http")) {
      url = `https://${url.replace(/^https?:\/\//, "")}`
    }

    record.paymentUrl = url
    await record.save()

    console.log("✅ PAYMENT LINK CREATED:", url)

    return res.json({
      success: true,
      url,
      orderId: record._id
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR:")

    if (err.response) {
      console.error("📡 STATUS:", err.response.status)
      console.error("📡 DATA:", JSON.stringify(err.response.data, null, 2))
    } else {
      console.error("🔥 SERVER:", err.message)
    }

    return res.status(500).json({
      message: err.message
    })
  }
})
export default router
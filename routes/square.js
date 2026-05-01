import express from "express"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED")

const client = new SquareClient({
  token: process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
  environment: SquareEnvironment.Sandbox
})

const LOCATION_ID = process.env.SQUARE_SANDBOX_LOCATION_ID

router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!id || id === "null") {
      return res.status(400).json({ message: "Invalid ID" })
    }

    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      return res.status(404).json({ message: "Record not found" })
    }

    /* ================= PREVENT DUPLICATE ================= */
    if (record.paymentUrl) {
      console.log("⚠️ Reusing existing payment link:", record.paymentUrl)
      return res.json({ success: true, url: record.paymentUrl })
    }

    /* ================= CALCULATE ================= */
    let subtotal = Number(record.subtotal || record.price || 0)
    let shipping = Number(record.shippingCost || 0)
    let tax = Number(record.tax || subtotal * 0.0825)

    const total = subtotal + shipping + tax

    if (!total || total <= 0) {
      return res.status(400).json({
        message: "Invalid total",
        debug: record
      })
    }

    const amount = BigInt(Math.round(total * 100))

    /* ================= IDEMPOTENCY ================= */
    const idempotencyKey = `${id}-payment`

    /* =========================================================
       🔥 CRITICAL FIX: ADD NOTE FOR WEBHOOK MATCHING
    ========================================================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey,
      order: {
        locationId: LOCATION_ID,

        // 🔥 THIS IS THE FIX
        note: `ID:${record._id}`,

        lineItems: [
          {
            name: `${type.toUpperCase()} #${record._id}`,
            quantity: "1",
            basePriceMoney: {
              amount,
              currency: "USD"
            }
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${id}`
      }
    })

    const url = response?.paymentLink?.url

    if (!url) {
      throw new Error("No payment URL returned")
    }

    /* ================= SAVE ================= */
    record.paymentUrl = url
    await record.save()

    console.log("✅ PAYMENT LINK CREATED:", url)

    res.json({ success: true, url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
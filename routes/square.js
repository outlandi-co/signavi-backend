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

/* 🔥 HARD REQUIRE LOCATION */
const LOCATION_ID = process.env.SQUARE_SANDBOX_LOCATION_ID

console.log("📍 LOCATION_ID:", LOCATION_ID)

/* 🔥 FORCE SAFE BASE URL */
const BASE_URL = "https://signavi-backend.onrender.com"

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

      let existingOrder =
        type === "quote"
          ? await Order.findOne({ quoteId: record._id })
          : record

      const invoiceUrl = existingOrder
        ? `${BASE_URL}/api/orders/${existingOrder._id}/invoice`
        : null

      return res.json({
        success: true,
        paymentUrl: record.paymentUrl,
        invoiceUrl,
        orderId: existingOrder?._id || null
      })
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

    /* ================= CREATE PAYMENT ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-payment`,
      order: {
        locationId: LOCATION_ID, // 🔥 MUST BE VALID
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

    const paymentUrl = response?.paymentLink?.url

    if (!paymentUrl) {
      throw new Error("No payment URL returned")
    }

    /* ================= ENSURE ORDER EXISTS ================= */
    let order = null

    if (type === "quote") {
      order = await Order.findOne({ quoteId: record._id })

      if (!order) {
        order = await Order.create({
          customerName: record.customerName,
          email: record.email,
          items: record.items,
          subtotal,
          tax,
          finalPrice: total,
          status: "payment_required",
          quoteId: record._id
        })

        console.log("🧾 ORDER CREATED FROM QUOTE:", order._id)
      }
    } else {
      order = record
    }

    /* ================= SAVE LINK ================= */
    record.paymentUrl = paymentUrl
    await record.save()

    console.log("✅ PAYMENT LINK CREATED:", paymentUrl)

    const invoiceUrl = `${BASE_URL}/api/orders/${order._id}/invoice`

    res.json({
      success: true,
      paymentUrl,
      invoiceUrl,
      orderId: order._id
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
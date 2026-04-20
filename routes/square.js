import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= ENV ================= */
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID

console.log("🔑 SQUARE ENV:", {
  token: SQUARE_TOKEN ? "exists" : "missing",
  location: SQUARE_LOCATION_ID || "missing"
})

if (!SQUARE_TOKEN) console.warn("⚠️ Missing SQUARE_ACCESS_TOKEN")
if (!SQUARE_LOCATION_ID) console.warn("⚠️ Missing SQUARE_LOCATION_ID")

/* ================= CLIENT ================= */
const client = new SquareClient({
  token: SQUARE_TOKEN,
  environment: SquareEnvironment.Production
})

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log("💳 CREATE PAYMENT:", id)

    let order = await Order.findById(id)

    /* 🔄 QUOTE FALLBACK */
    if (!order) {
      const quote = await Quote.findById(id)

      if (!quote) {
        console.log("❌ Not found")
        return res.status(404).json({ message: "Not found" })
      }

      if (quote.approvalStatus !== "approved") {
        return res.status(403).json({
          message: "Artwork must be approved"
        })
      }

      order = {
        _id: quote._id,
        customerName: quote.customerName,
        email: quote.email,
        finalPrice: quote.price
      }
    }

    /* ================= AMOUNT ================= */
    const rawAmount = Number(order.finalPrice || 0)

    if (!rawAmount || rawAmount <= 0) {
      console.log("❌ Invalid amount:", rawAmount)
      return res.status(400).json({ message: "Invalid amount" })
    }

    // 🔥 ONLY DEFINE BIGINT HERE
    const amount = BigInt(Math.round(rawAmount * 100))

    console.log("🧪 TYPE:", typeof amount, amount)

    /* ================= CREATE LINK ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${order._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount, // ✅ DO NOT WRAP AGAIN
              currency: "USD"
            }
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${order._id}`
      }
    })

    console.log("🧾 FULL SQUARE RESPONSE:", response)

    const url = response?.paymentLink?.url

    if (!url) {
      console.log("❌ Missing payment URL")
      return res.status(500).json({
        message: "Payment link failed",
        squareResponse: response
      })
    }

    console.log("✅ PAYMENT LINK:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ SQUARE ERROR FULL:", err)

    res.status(500).json({
      message: err?.message,
      errors: err?.errors || null,
      body: err?.body || null
    })
  }
})

/* =========================================================
   ✅ CONFIRM PAYMENT
========================================================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log("💳 CONFIRM PAYMENT:", id)

    let order = await Order.findById(id)

    /* 🔄 QUOTE → ORDER */
    if (!order) {
      const quote = await Quote.findById(id)

      if (!quote) {
        return res.status(404).json({ message: "Not found" })
      }

      console.log("🔄 Converting Quote → Order")

      order = await Order.create({
        customerName: quote.customerName,
        email: quote.email,
        quantity: quote.quantity,
        printType: quote.printType,
        artwork: quote.artwork,
        price: quote.price,
        finalPrice: quote.price,
        source: "quote",
        status: "paid",
        timeline: [
          {
            status: "paid",
            date: new Date(),
            note: "Payment confirmed via Square"
          }
        ]
      })

      await Quote.findByIdAndDelete(id)
    }

    if (!order.timeline) order.timeline = []

    order.status = "production"

    order.timeline.push({
      status: "production",
      date: new Date(),
      note: "Auto moved to production"
    })

    await order.save()

    req.app.get("io")?.emit("jobUpdated", order)

    if (order.email) {
      await sendOrderStatusEmail(order.email, "paid", order._id, order)
    }

    console.log("✅ ORDER READY:", order._id)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
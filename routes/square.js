import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= INIT ================= */
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID

if (!SQUARE_TOKEN) console.warn("⚠️ Missing SQUARE_ACCESS_TOKEN")
if (!SQUARE_LOCATION_ID) console.warn("⚠️ Missing SQUARE_LOCATION_ID")

const client = new SquareClient({
  accessToken: SQUARE_TOKEN,
  environment: SquareEnvironment.Production // switch to Sandbox if testing
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

    const rawAmount = Number(order.finalPrice || 0)

    if (!rawAmount || rawAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" })
    }

    const amount = Math.round(rawAmount * 100)

    console.log("💰 AMOUNT (cents):", amount)

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${order._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: BigInt(amount), // 🔥 REQUIRED
              currency: "USD"
            }
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${order._id}`
      }
    })

    const url = response?.paymentLink?.url

    if (!url) {
      return res.status(500).json({ message: "Payment link failed" })
    }

    console.log("✅ PAYMENT LINK:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)

    res.status(500).json({
      message: err?.message || "Payment error",
      details: err?.body || null
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

    /* 🔥 UPDATE STATUS */
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
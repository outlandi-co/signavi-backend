import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= INIT SQUARE ================= */
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID

if (!SQUARE_TOKEN) {
  console.warn("⚠️ Missing SQUARE_ACCESS_TOKEN")
}
if (!SQUARE_LOCATION_ID) {
  console.warn("⚠️ Missing SQUARE_LOCATION_ID")
}

const client = new SquareClient({
  accessToken: SQUARE_TOKEN,
  environment: SquareEnvironment.Production // or Sandbox if testing
})

/* ================= CREATE PAYMENT ================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log("💳 CREATE PAYMENT FOR:", id)

    let order = await Order.findById(id)
    let quote = null

    if (!order) {
      quote = await Quote.findById(id)

      if (!quote) {
        console.log("❌ Not found in Order or Quote")
        return res.status(404).json({ message: "Not found" })
      }

      if (quote.approvalStatus !== "approved") {
        console.log("❌ Quote not approved")
        return res.status(403).json({ message: "Artwork must be approved" })
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
      console.log("❌ Invalid amount:", rawAmount)
      return res.status(400).json({ message: "Invalid amount" })
    }

    const amount = Math.round(rawAmount * 100) // cents

    console.log("💰 AMOUNT:", amount)

    /* ================= CREATE PAYMENT LINK ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,
      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${order._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount, // ⚠️ MUST be number, not BigInt
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
      console.log("❌ No payment URL returned")
      return res.status(500).json({ message: "Payment link failed" })
    }

    console.log("✅ PAYMENT LINK CREATED:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR FULL:", err)

    // 🔥 expose useful error to frontend for debugging
    res.status(500).json({
      message: err?.message || "Payment error",
      squareError: err?.body || null
    })
  }
})

/* ================= CONFIRM PAYMENT ================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log("💳 CONFIRM PAYMENT:", id)

    let order = await Order.findById(id)

    if (!order) {
      const quote = await Quote.findById(id)

      if (!quote) {
        return res.status(404).json({ message: "Not found" })
      }

      console.log("🔄 CONVERT QUOTE → ORDER")

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

    if (order.status !== "paid") {
      order.status = "paid"

      order.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment confirmed"
      })
    }

    /* 🔥 AUTO MOVE */
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

    console.log("✅ ORDER → PRODUCTION:", order._id)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
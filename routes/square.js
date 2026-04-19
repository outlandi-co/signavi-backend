import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const client = new SquareClient({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

/* ================= CREATE PAYMENT ================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    let order = await Order.findById(req.params.id)
    let quote = null

    if (!order) {
      quote = await Quote.findById(req.params.id)

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

    const amount = Math.round((order.finalPrice || 0) * 100)

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        lineItems: [
          {
            name: `Order #${order._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: BigInt(amount),
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

    res.json({ url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CONFIRM PAYMENT ================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CONFIRM PAYMENT:", id)

    let order = await Order.findById(id)

    /* ================= HANDLE QUOTE → ORDER ================= */
    if (!order) {
      const quote = await Quote.findById(id)

      if (!quote) {
        return res.status(404).json({ message: "Not found" })
      }

      console.log("🔄 CONVERTING QUOTE → ORDER")

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

      // 🔥 REMOVE OLD QUOTE
      await Quote.findByIdAndDelete(id)
    }

    /* ================= UPDATE EXISTING ORDER ================= */
    if (order.status !== "paid") {
      order.status = "paid"

      if (!order.timeline) order.timeline = []

      order.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment confirmed via Square"
      })
    }

    /* ================= AUTO MOVE TO PRODUCTION ================= */
    order.status = "production"

    order.timeline.push({
      status: "production",
      date: new Date(),
      note: "Auto moved to production"
    })

    await order.save()

    console.log("✅ ORDER → PRODUCTION:", order._id)

    /* ================= SOCKET ================= */
    req.app.get("io")?.emit("jobUpdated", order)

    /* ================= EMAIL ================= */
    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "paid",
        order._id,
        order
      )
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
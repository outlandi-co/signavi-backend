import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= SQUARE CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN, // ✅ FIXED
  environment: SquareEnvironment.Production
})

/* =========================================================
   💳 CREATE PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    console.log("\n💳 CREATE PAYMENT START:", req.params.id)

    let order = await Order.findById(req.params.id)
    let quote = null

    /* ================= FALLBACK TO QUOTE ================= */
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

    /* ================= FIX PRICE ================= */
    let price = Number(order.finalPrice || 0)

    if (!price || price <= 0) {
      console.warn("⚠️ INVALID PRICE → forcing minimum $1")
      price = 1 // 🔥 fallback so Square doesn't crash
    }

    const amount = Math.round(price * 100)

    console.log("💰 FINAL AMOUNT:", amount)

    /* ================= LOCATION CHECK ================= */
    if (!process.env.SQUARE_LOCATION_ID) {
      throw new Error("Missing SQUARE_LOCATION_ID")
    }

    /* ================= CREATE LINK ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${order._id}-${Date.now()}`,

      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        lineItems: [
          {
            name: `Order #${order._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount, // ✅ FIXED (NO BigInt)
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
      throw new Error("No payment URL returned from Square")
    }

    console.log("✅ PAYMENT LINK CREATED:", url)

    res.json({ url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR FULL:", err)

    res.status(500).json({
      message: "Payment creation failed",
      error: err.message
    })
  }
})

/* =========================================================
   ✅ CONFIRM PAYMENT
========================================================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("\n💳 CONFIRM PAYMENT:", id)

    let order = await Order.findById(id)

    /* ================= QUOTE → ORDER ================= */
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

      await Quote.findByIdAndDelete(id)
    }

    /* ================= UPDATE STATUS ================= */
    if (order.status !== "paid") {
      order.status = "paid"
    }

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status: "paid",
      date: new Date(),
      note: "Payment confirmed via Square"
    })

    /* 🔥 AUTO MOVE TO PRODUCTION */
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

    res.status(500).json({
      message: err.message
    })
  }
})

export default router
import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   🔥 SQUARE WEBHOOK → AUTO PROCESS (FINAL VERSION)
========================================================= */
router.post("/square", express.json(), async (req, res) => {
  try {
    console.log("📡 WEBHOOK RECEIVED")

    const event = req.body
    console.log("🧪 EVENT TYPE:", event?.type)

    /* =========================================================
       💳 VALIDATE PAYMENT
    ========================================================= */
    const payment = event?.data?.object?.payment

    if (!payment) {
      console.warn("⚠️ No payment object")
      return res.sendStatus(200)
    }

    if (payment.status !== "COMPLETED") {
      console.log("⏭️ Skipping status:", payment.status)
      return res.sendStatus(200)
    }

    console.log("💳 PAYMENT:", payment.id)

    /* =========================================================
       🔥 METADATA
    ========================================================= */
    const metadata = payment?.metadata || {}

    const recordId =
      metadata.recordId ||
      metadata.quoteId ||
      metadata.orderId ||
      payment?.orderId

    const type = metadata.type || "order"

    if (!recordId) {
      console.warn("⚠️ Missing recordId")
      return res.sendStatus(200)
    }

    console.log(`📦 PROCESSING ${type.toUpperCase()}:`, recordId)

    /* =========================================================
       🔥 EXTRACT EMAIL FROM SQUARE
    ========================================================= */
    const buyerEmail =
      payment?.buyerEmailAddress ||
      payment?.billingAddress?.email ||
      null

    console.log("📧 SQUARE EMAIL:", buyerEmail)

    /* =========================================================
       🟦 QUOTE → ORDER
    ========================================================= */
    if (type === "quote") {
      const quote = await Quote.findById(recordId)

      if (!quote) {
        console.warn("⚠️ Quote not found:", recordId)
        return res.sendStatus(200)
      }

      if (quote.status === "paid" || quote.status === "archive") {
        console.log("⚠️ Quote already processed")
        return res.sendStatus(200)
      }

      quote.status = "paid"

      if (!quote.timeline) quote.timeline = []

      quote.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment received via webhook"
      })

      await quote.save()

      console.log("✅ QUOTE MARKED PAID")

      const order = new Order({
        customerName: quote.customerName,
        email: buyerEmail || quote.email, // 🔥 FIXED
        quantity: quote.quantity,
        price: quote.price,
        finalPrice: quote.price,
        items: quote.items,
        artwork: quote.artwork,
        notes: quote.notes,

        status: "paid",
        productionStatus: "queued",
        source: "quote",

        timeline: [
          {
            status: "paid",
            date: new Date(),
            note: "Converted from quote (webhook)"
          }
        ]
      })

      await order.save()

      console.log("🔥 ORDER CREATED:", order._id)

      quote.status = "archive"
      await quote.save()

      const io = req.app.get("io")
      if (io) io.emit("jobCreated", order)

      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
      }
    }

    /* =========================================================
       🟩 ORDER → MARK PAID + SYNC EMAIL
    ========================================================= */
    if (type === "order") {
      const order = await Order.findById(recordId)

      if (!order) {
        console.warn("⚠️ Order not found:", recordId)
        return res.sendStatus(200)
      }

      if (order.status === "paid") {
        console.log("⚠️ Order already processed")
        return res.sendStatus(200)
      }

      /* 🔥 UPDATE EMAIL FROM SQUARE */
      if (buyerEmail && !order.email) {
        order.email = buyerEmail
        console.log("✅ ORDER EMAIL UPDATED")
      }

      order.status = "paid"
      order.productionStatus = "queued"

      if (!order.timeline) order.timeline = []

      order.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment received via webhook"
      })

      await order.save()

      console.log("✅ ORDER MARKED PAID:", order._id)

      const io = req.app.get("io")
      if (io) io.emit("jobUpdated", order)

      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
        console.log("📧 EMAIL SENT")
      } else {
        console.warn("⚠️ No email available")
      }
    }

    return res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err)
    return res.sendStatus(500)
  }
})

export default router
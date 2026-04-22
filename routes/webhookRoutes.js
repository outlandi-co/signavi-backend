import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   🔥 SQUARE WEBHOOK → AUTO PROCESS (QUOTE + ORDER)
========================================================= */
router.post("/square", express.json(), async (req, res) => {
  try {
    console.log("📡 WEBHOOK RECEIVED")

    const event = req.body
    console.log("🧪 EVENT TYPE:", event?.type)

    /* =========================================================
       💳 ONLY PROCESS COMPLETED PAYMENTS
    ========================================================= */
    const payment = event?.data?.object?.payment

    if (!payment) {
      console.warn("⚠️ No payment object")
      return res.sendStatus(200)
    }

    // 🔥 ONLY process COMPLETED payments (CRITICAL)
    if (payment.status !== "COMPLETED") {
      console.log("⏭️ Ignoring non-completed payment:", payment.status)
      return res.sendStatus(200)
    }

    console.log("💳 PAYMENT:", payment.id)

    /* =========================================================
       🔥 GET METADATA
    ========================================================= */
    const recordId =
      payment?.metadata?.recordId ||
      payment?.metadata?.quoteId ||
      payment?.orderId

    const type = payment?.metadata?.type || "quote"

    if (!recordId) {
      console.warn("⚠️ No recordId in webhook")
      return res.sendStatus(200)
    }

    console.log(`📦 PROCESSING ${type.toUpperCase()}:`, recordId)

    /* =========================================================
       🟦 CASE 1: QUOTE → CONVERT TO ORDER
    ========================================================= */
    if (type === "quote") {
      const quote = await Quote.findById(recordId)

      if (!quote) {
        console.warn("⚠️ Quote not found:", recordId)
        return res.sendStatus(200)
      }

      // 🔥 PREVENT DOUBLE PROCESSING
      if (quote.status === "paid" || quote.status === "archive") {
        console.log("⚠️ Quote already processed")
        return res.sendStatus(200)
      }

      /* 🔥 MARK PAID */
      quote.status = "paid"

      if (!quote.timeline) quote.timeline = []

      quote.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment received via Square webhook"
      })

      await quote.save()

      console.log("✅ QUOTE MARKED PAID")

      /* 🔥 CREATE ORDER */
      const order = new Order({
        customerName: quote.customerName,
        email: quote.email,
        quantity: quote.quantity,
        price: quote.price,
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
            note: "Converted from quote (auto)"
          }
        ]
      })

      await order.save()

      console.log("🔥 ORDER CREATED:", order._id)

      /* 🔥 ARCHIVE QUOTE */
      quote.status = "archive"
      await quote.save()

      /* 🔌 SOCKET */
      const io = req.app.get("io")
      if (io) io.emit("jobCreated", order)

      /* 📧 EMAIL */
      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
      }
    }

    /* =========================================================
       🟩 CASE 2: ORDER → MARK PAID ONLY
    ========================================================= */
    if (type === "order") {
      const order = await Order.findById(recordId)

      if (!order) {
        console.warn("⚠️ Order not found:", recordId)
        return res.sendStatus(200)
      }

      // 🔥 PREVENT DOUBLE PROCESSING
      if (order.status === "paid") {
        console.log("⚠️ Order already processed")
        return res.sendStatus(200)
      }

      /* 🔥 MARK PAID */
      order.status = "paid"
      order.productionStatus = "queued"

      if (!order.timeline) order.timeline = []

      order.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment received via Square webhook"
      })

      await order.save()

      console.log("✅ ORDER MARKED PAID:", order._id)

      /* 🔌 SOCKET */
      const io = req.app.get("io")
      if (io) io.emit("jobUpdated", order)

      /* 📧 EMAIL */
      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
      }
    }

    return res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err)
    return res.sendStatus(500)
  }
})

export default router
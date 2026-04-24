import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import Product from "../models/Product.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

router.post("/square", express.json(), async (req, res) => {
  try {
    console.log("📡 WEBHOOK RECEIVED")

    const event = req.body
    console.log("🧪 EVENT TYPE:", event?.type)

    const payment = event?.data?.object?.payment

    if (!payment) {
      console.warn("⚠️ No payment object")
      return res.sendStatus(200)
    }

    if (payment.status !== "COMPLETED") {
      console.log("⏭️ Skipping:", payment.status)
      return res.sendStatus(200)
    }

    console.log("💳 PAYMENT COMPLETE:", payment.id)

    /* ================= METADATA ================= */
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

    /* ================= EMAIL ================= */
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

      if (!quote || quote.status === "paid" || quote.status === "archive") {
        return res.sendStatus(200)
      }

      quote.status = "paid"
      quote.timeline = quote.timeline || []

      quote.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment received via webhook"
      })

      await quote.save()

      const order = new Order({
        customerName: quote.customerName,
        email: buyerEmail || quote.email,
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
      quote.status = "archive"
      await quote.save()

      req.app.get("io")?.emit("jobCreated", order)

      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
      }
    }

    /* =========================================================
       🟩 ORDER → INVENTORY + PAID
    ========================================================= */
    if (type === "order") {
      const order = await Order.findById(recordId)

      if (!order || order.status === "paid") {
        return res.sendStatus(200)
      }

      /* 🔥 UPDATE EMAIL */
      if (buyerEmail && !order.email) {
        order.email = buyerEmail
      }

      console.log("🔥 DEDUCTING INVENTORY...")

      /* ================= INVENTORY DEDUCTION ================= */
      for (const item of order.items) {

        const product = await Product.findOne({ name: item.name })

        if (!product || !product.variants?.length) {
          console.warn("⚠️ Product missing:", item.name)
          continue
        }

        const variant = product.variants.find(v => {
          return (
            String(v.color).trim().toLowerCase() ===
            String(item.variant?.color).trim().toLowerCase() &&
            String(v.size).trim().toUpperCase() ===
            String(item.variant?.size).trim().toUpperCase()
          )
        })

        if (!variant) {
          console.warn("⚠️ Variant missing:", item.variant)
          continue
        }

        variant.stock = Math.max(0, variant.stock - item.quantity)

        console.log(
          `📦 STOCK UPDATED → ${product.name} (${variant.size}) = ${variant.stock}`
        )

        await product.save()
      }

      /* ================= MARK PAID ================= */
      order.status = "paid"
      order.productionStatus = "queued"

      order.timeline = order.timeline || []
      order.timeline.push({
        status: "paid",
        date: new Date(),
        note: "Payment confirmed via webhook"
      })

      await order.save()

      console.log("✅ ORDER MARKED PAID:", order._id)

      req.app.get("io")?.emit("jobUpdated", order)

      if (order.email) {
        await sendOrderStatusEmail(order.email, "paid", order._id, order)
        console.log("📧 EMAIL SENT")
      }
    }

    return res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err)
    return res.sendStatus(500)
  }
})

export default router
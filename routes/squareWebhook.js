import express from "express"
import mongoose from "mongoose"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🔥 SQUARE WEBHOOK
========================================================= */
router.post("/webhook", async (req, res) => {
  try {
    // 🔥 RAW BODY → JSON
    const event = JSON.parse(req.body.toString())

    console.log("📥 WEBHOOK RECEIVED:", event?.type)

    if (event?.type !== "payment.created") {
      return res.sendStatus(200)
    }

    const payment = event?.data?.object?.payment
    const note = payment?.note || ""

    const id = note.replace("ID:", "").trim()

    if (!isValidId(id)) {
      console.warn("⚠️ Invalid ID from webhook:", id)
      return res.sendStatus(200)
    }

    console.log("🔎 Extracted ID:", id)

    /* ================= FIND RECORD ================= */
    let quote = await Quote.findById(id)
    let order = await Order.findById(id)

    /* =========================================================
       🔥 CASE 1: QUOTE → CONVERT TO ORDER
    ========================================================= */
    if (quote && !order) {
      console.log("🔁 Converting Quote → Order")

      const newOrder = new Order({
        customerName: quote.customerName,
        email: quote.email,
        quantity: quote.quantity,
        price: quote.price,
        subtotal: quote.price,
        shippingCost: quote.shippingCost || 0,
        tax: quote.tax || 0,
        finalPrice:
          (quote.price || 0) +
          (quote.shippingCost || 0) +
          (quote.tax || 0),

        items: quote.items || [],
        artwork: quote.artwork || "",
        printType: quote.printType || "screenprint",

        status: "production", // 🔥 AUTO MOVE
        source: "order",

        timeline: [
          ...(quote.timeline || []),
          {
            status: "paid",
            note: "Payment received",
            date: new Date()
          },
          {
            status: "production",
            note: "Moved to production",
            date: new Date()
          }
        ]
      })

      await newOrder.save()

      // 🔥 mark quote as paid/archived
      quote.status = "paid"
      quote.approvalStatus = "approved"

      quote.timeline.push({
        status: "paid",
        note: "Payment completed",
        date: new Date()
      })

      await quote.save()

      console.log("✅ ORDER CREATED:", newOrder._id)

      /* ================= EMAIL ================= */
      try {
        await sendOrderStatusEmail(
          newOrder.email,
          "paid",
          newOrder._id,
          newOrder
        )
      } catch (err) {
        console.error("❌ EMAIL FAIL:", err)
      }

      /* ================= SOCKET ================= */
      req.app.get("io")?.emit("jobUpdated", newOrder)

      return res.sendStatus(200)
    }

    /* =========================================================
       🔥 CASE 2: EXISTING ORDER → MARK PAID
    ========================================================= */
    if (order) {
      order.status = "production"

      order.timeline.push({
        status: "paid",
        note: "Payment received",
        date: new Date()
      })

      await order.save()

      console.log("✅ ORDER MARKED PAID:", order._id)

      try {
        await sendOrderStatusEmail(
          order.email,
          "paid",
          order._id,
          order
        )
      } catch (err) {
        console.error("❌ EMAIL FAIL:", err)
      }

      req.app.get("io")?.emit("jobUpdated", order)

      return res.sendStatus(200)
    }

    console.warn("⚠️ No record found for ID:", id)

    res.sendStatus(200)
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err)
    res.sendStatus(500)
  }
})

/* 🔥 Optional browser check */
router.get("/webhook", (req, res) => {
  res.send("Webhook is live (POST only)")
})

export default router
import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    console.log("🔥 PRODUCTION ROUTE HIT")

    const orders = await Order.find().lean().sort({ createdAt: -1 })
    const quotes = await Quote.find().lean().sort({ createdAt: -1 })

    console.log("📦 ORDERS:", orders.length)
    console.log("📝 QUOTES:", quotes.length)

    const all = []

    /* ================= BUILD ================= */
    for (const o of orders) {
      if (!o) continue

      all.push({
        _id: o._id,
        customerName: o.customerName || "Unknown",
        email: o.email || "",
        quantity: o.quantity || 0,
        printType: o.printType || "",
        artwork: o.artwork || null,
        price: o.price || 0,
        finalPrice: o.finalPrice || 0,
        status: o.status || "pending",
        source: o.source || "store",
        createdAt: o.createdAt,
        type: "order"
      })
    }

    for (const q of quotes) {
      if (!q) continue

      all.push({
        _id: q._id,
        customerName: q.customerName || "Unknown",
        email: q.email || "",
        quantity: q.quantity || 0,
        printType: q.printType || "",
        artwork: q.artwork || null,
        price: q.price || 0,
        finalPrice: q.price || 0,
        status: q.status || "pending",
        source: "quote",
        createdAt: q.createdAt,
        type: "quote"
      })
    }

    /* ================= GROUP ================= */
    const grouped = {
      pending: [],
      artwork_sent: [],
      payment_required: [],
      production: [],
      shipped: [],
      denied: [],
      archive: [],
      quotes: []
    }

    for (const job of all) {
      if (!job) continue

      /* 📝 QUOTES */
      if (job.type === "quote") {
        grouped.quotes.push(job)
        continue
      }

      let status = job.status || "pending"

      /* 🔥 FIXED STATUS MAPPING */
      if (status === "paid") {
        status = "production"
      }

      if (status === "shipping") {
        status = "shipped" // 🔥 CRITICAL FIX
      }

      /* 🔥 SAFETY */
      if (!grouped[status]) {
        console.log("⚠️ Unknown status:", status)
        status = "pending"
      }

      grouped[status].push(job)
    }

    console.log("📊 GROUPED COUNTS:", {
      pending: grouped.pending.length,
      artwork_sent: grouped.artwork_sent.length,
      payment_required: grouped.payment_required.length,
      production: grouped.production.length,
      shipped: grouped.shipped.length,
      denied: grouped.denied.length,
      archive: grouped.archive.length,
      quotes: grouped.quotes.length
    })

    res.json(grouped)

  } catch (err) {
    console.error("❌ PRODUCTION ERROR:", err)

    res.status(500).json({
      message: err.message
    })
  }
})

export default router
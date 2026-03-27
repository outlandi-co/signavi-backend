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

    /* ================= SAFE BUILD ================= */

    for (const o of orders) {
      try {
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

      } catch (err) {
        console.error("❌ ORDER ERROR:", o?._id, err)
      }
    }

    for (const q of quotes) {
      try {
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

      } catch (err) {
        console.error("❌ QUOTE ERROR:", q?._id, err)
      }
    }

    /* ================= GROUP ================= */

    const grouped = {
      quotes: [],
      store: [],
      payment_required: [],
      production: [],
      shipped: [],
      denied: []
    }

    for (const job of all) {
      try {
        if (!job) continue

        console.log("🧪 ALL JOBS:", all)
        const status = job.status || "pending"
        const source = job.source || "store"

        /* 📝 QUOTES */
        if (job.type === "quote") {
          grouped.quotes.push(job)
          continue
        }

        /* 🛒 STORE ORDERS */
        if (source === "store" && status === "pending") {
          grouped.store.push(job)
          continue
        }

        /* 💳 PAYMENT REQUIRED */
        if (status === "payment_required") {
          grouped.payment_required.push(job)
          continue
        }

        /* 🏭 PRODUCTION */
        if (["paid", "printing", "ready"].includes(status)) {
          grouped.production.push(job)
          continue
        }

        /* 🚚 SHIPPED */
        if (status === "shipped") {
          grouped.shipped.push(job)
          continue
        }

        /* ❌ DENIED */
        if (status === "denied") {
          grouped.denied.push(job)
          continue
        }

        /* fallback */
        grouped.production.push(job)

      } catch (err) {
        console.error("⚠️ GROUP ERROR:", job?._id, err)
      }
    }

    console.log("📊 GROUPED:", {
      quotes: grouped.quotes.length,
      store: grouped.store.length,
      payment_required: grouped.payment_required.length,
      production: grouped.production.length,
      shipped: grouped.shipped.length,
      denied: grouped.denied.length
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
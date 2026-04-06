import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().lean().sort({ createdAt: -1 })
    const quotes = await Quote.find().lean().sort({ createdAt: -1 })

    const grouped = {
      quotes: [],
      pending: [],
      payment_required: [],
      production: [],
      shipping: [],
      shipped: [],
      delivered: [],
      denied: [],
      archive: []
    }

    /* ================= ORDERS ================= */
    for (const o of orders) {
      if (!o) continue

      let status = o.status || "pending"

      /* 🔥 AUTO FLOW */
      if (status === "paid") status = "production"

      if (!grouped[status]) status = "pending"

      grouped[status].push(o)
    }

    /* ================= QUOTES ================= */
    for (const q of quotes) {
      grouped.quotes.push({
        ...q,
        status: "quotes"
      })
    }

    res.json(grouped)

  } catch (err) {
    console.error("❌ PRODUCTION ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
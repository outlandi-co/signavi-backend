import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= GET PRODUCTION BOARD ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find()
    const orders = await Order.find()

    const all = [
      ...quotes.map(q => ({ ...q.toObject(), type: "quote" })),
      ...orders.map(o => ({ ...o.toObject(), type: "order" }))
    ]

    const grouped = {
      pending: [],
      approved: [],
      printing: [],
      ready: [],
      shipping: [],
      shipped: [],
      denied: [],
      artwork_sent: []
    }

    all.forEach(job => {
      let status = job.status || "pending"

      if (!grouped[status]) {
        console.warn("⚠️ Unknown status:", status, "→ forcing to pending")
        status = "pending"
      }

      grouped[status].push(job)
    })

    res.json(grouped)

  } catch (err) {
    console.error("❌ PRODUCTION FETCH ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
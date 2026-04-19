import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    console.log("🔥 PRODUCTION ROUTE HIT")

    const orders = await Order.find().lean().sort({ createdAt: -1 })
    const quotes = await Quote.find().lean().sort({ createdAt: -1 })

    const all = []

    /* ================= NORMALIZE ORDERS ================= */
    for (const o of orders) {
      if (!o) continue

      const status = normalizeOrderStatus(o.status)

      all.push({
        _id: o._id,
        customerName: o.customerName || "Unknown",
        email: o.email || "",
        quantity: o.quantity || 0,
        printType: o.printType || "",
        artwork: o.artwork || null,
        price: o.price || 0,
        finalPrice: o.finalPrice || 0,

        status,            // workflow
        group: status,     // UI column

        source: "order",
        type: "order",
        createdAt: o.createdAt
      })
    }

    /* ================= NORMALIZE QUOTES ================= */
    for (const q of quotes) {
      if (!q) continue

      let status = "quotes"
      let group = "quotes"
      let source = "quote"

      // 🔥 HANDLE APPROVAL FLOW
      if (q.approvalStatus === "approved") {
        status = "payment_required"
        group = "payment_required"
        source = "order"
      }

      if (q.approvalStatus === "denied") {
        status = "denied"
        group = "quotes" // keep visible in quotes column
      }

      all.push({
        _id: q._id,
        customerName: q.customerName || "Unknown",
        email: q.email || "",
        quantity: q.quantity || 0,
        printType: q.printType || "",
        artwork: q.artwork || null,
        price: q.price || 0,
        finalPrice: q.price || 0,

        status,
        group,

        source,
        type: "quote",
        createdAt: q.createdAt
      })
    }

    /* ================= GROUP ================= */
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

    for (const job of all) {
      if (!job) continue

      const group = job.group || "pending"

      if (!grouped[group]) {
        grouped.pending.push(job)
        continue
      }

      grouped[group].push(job)
    }

    res.json(grouped)

  } catch (err) {
    console.error("❌ PRODUCTION ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= ORDER STATUS NORMALIZER ================= */
function normalizeOrderStatus(status) {
  if (!status) return "pending"

  if (["paid", "printing", "ready"].includes(status)) {
    return "production"
  }

  return status
}

export default router
import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= TAX EXPORT ================= */
router.get("/", async (req, res) => {
  try {
    const { start, end, status } = req.query

    let query = {}

    /* ================= DATE FILTER ================= */
    if (start || end) {
      query.createdAt = {}

      if (start) query.createdAt.$gte = new Date(start)
      if (end) query.createdAt.$lte = new Date(end)
    }

    /* ================= STATUS FILTER ================= */
    if (status && status !== "all") {
      query.status = status
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean()

    let csv = "Date,Order ID,Customer,Revenue,Stripe Fee,COGS,Shipping,Net Profit\n"

    orders.forEach(order => {

      const date = new Date(order.createdAt).toLocaleDateString()

      const revenue = Number(order.total || order.price || 0)

      /* 💳 Stripe fee (safe calc) */
      const stripeFee = revenue > 0
        ? (revenue * 0.029 + 0.30)
        : 0

      /* 📦 REAL COST OF GOODS */
      let cogs = 0

      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const cost = Number(item.cost || 0)
          const qty = Number(item.quantity || 1)
          cogs += cost * qty
        })
      }

      /* 🚚 SHIPPING (adjust later if needed) */
      const shipping = 5

      /* 💰 PROFIT */
      const profit = revenue - stripeFee - cogs - shipping

      csv += [
        date,
        order.orderId || order._id,
        order.customerName || "N/A",
        revenue.toFixed(2),
        stripeFee.toFixed(2),
        cogs.toFixed(2),
        shipping.toFixed(2),
        profit.toFixed(2)
      ].join(",") + "\n"
    })

    res.header("Content-Type", "text/csv")
    res.attachment("tax-report.csv")
    res.send(csv)

  } catch (err) {
    console.error("❌ TAX EXPORT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
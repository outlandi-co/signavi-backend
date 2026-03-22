import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= EXPORT WITH FILTERS ================= */
router.get("/", async (req, res) => {
  try {
    const { start, end, status } = req.query

    let query = {}

    /* 📅 DATE FILTER */
    if (start || end) {
      query.createdAt = {}

      if (start) query.createdAt.$gte = new Date(start)
      if (end) query.createdAt.$lte = new Date(end)
    }

    /* 📊 STATUS FILTER */
    if (status && status !== "all") {
      query.status = status
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean()

    let csv = "Order ID,Product,Qty,Price,Total,Status,Date\n"

    orders.forEach(order => {
      const date = new Date(order.createdAt).toLocaleString()

      if (!order.items || order.items.length === 0) {
        csv += `${order.orderId || order._id},N/A,0,0,${order.total || 0},${order.status},${date}\n`
        return
      }

      order.items.forEach(item => {
        csv += `${order.orderId || order._id},${item.name || "Unknown"},${item.quantity || 0},${item.price || 0},${order.total || 0},${order.status},${date}\n`
      })
    })

    res.header("Content-Type", "text/csv")
    res.attachment("orders.csv")
    res.send(csv)

  } catch (err) {
    console.error("❌ EXPORT FILTER ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
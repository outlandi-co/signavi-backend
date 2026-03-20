import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })

    let csv = "Order ID,Product,Qty,Price,Total,Status,Date\n"

    orders.forEach(order => {
      order.items.forEach(item => {
        csv += `${order.orderId},${item.name},${item.quantity},${item.price},${order.total},${order.status},${order.createdAt}\n`
      })
    })

    res.header("Content-Type", "text/csv")
    res.attachment("orders.csv")
    res.send(csv)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
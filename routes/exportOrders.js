import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

router.get("/", async (req, res) => {

  try {

    const orders = await Order.find().sort({ createdAt: -1 })

    let csv = "Order ID,Product,Quantity,Size,Color,Price,Total,Status,Date\n"

    orders.forEach(order => {

      order.items.forEach(item => {

        csv += `${order.orderId},${item.name},${item.quantity},${item.size || ""},${item.color || ""},${item.price},${order.total},${order.status},${order.createdAt}\n`

      })

    })

    res.header("Content-Type", "text/csv")
    res.attachment("orders.csv")
    res.send(csv)

  } catch (error) {

    res.status(500).json({ error: error.message })

  }

})

export default router
import express from "express"
import Order from "../models/Order.js"
import Product from "../models/Product.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {

    const orders = await Order.find()

    let totalRevenue = 0
    const productSales = {}

    orders.forEach(order => {

      totalRevenue += order.total || 0

      order.items.forEach(item => {

        if (!productSales[item.name]) {
          productSales[item.name] = 0
        }

        productSales[item.name] += item.quantity

      })

    })

    const topProducts = Object.entries(productSales)
      .map(([name, sold]) => ({ name, sold }))
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)

    const lowInventory = await Product.find({
      quantity: { $lt: 5 }
    })

    res.json({
      totalOrders: orders.length,
      totalRevenue,
      topProducts,
      lowInventory
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

router.get("/", async (req, res) => {

  try {

    const orders = await Order.find({ status: "paid" })

    const summary = {}

    orders.forEach(order => {

      order.items.forEach(item => {

        const key = `${item.name} ${item.size || ""} ${item.color || ""}`

        if (!summary[key]) {
          summary[key] = 0
        }

        summary[key] += item.quantity

      })

    })

    let csv = "Product,Total Quantity\n"

    Object.entries(summary).forEach(([product, qty]) => {
      csv += `${product},${qty}\n`
    })

    res.header("Content-Type", "text/csv")
    res.attachment("production-sheet.csv")
    res.send(csv)

  } catch (error) {

    res.status(500).json({ error: error.message })

  }

})

export default router
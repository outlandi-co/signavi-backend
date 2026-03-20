import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

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
      printing: [],
      ready: [],
      shipping: [],
      shipped: [],
      delivered: []
    }

    all.forEach(job => {
      const status = job.status || "pending"
      if (!grouped[status]) grouped[status] = []
      grouped[status].push(job)
    })

    res.json(grouped)
  } catch (err) {
    console.error("PRODUCTION ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find()
    const orders = await Order.find()

    const jobs = [
      ...quotes.map(q => ({ ...q.toObject(), type: "quote" })),
      ...orders.map(o => ({ ...o.toObject(), type: "order" }))
    ]

    /* 🔥 GROUP INTO COLUMNS */
    const columns = {
      pending: [],
      printing: [],
      ready: [],
      shipping: [],
      shipped: [],
      delivered: []
    }

    jobs.forEach(job => {
      const status = job.status || "pending"

      if (!columns[status]) {
        columns.pending.push(job)
      } else {
        columns[status].push(job)
      }
    })

    res.json(columns)

  } catch (err) {
    console.error("PRODUCTION ERROR:", err)
    res.status(500).json({ error: "Failed to load production data" })
  }
})

export default router
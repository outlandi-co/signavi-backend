import express from "express"
import Order from "../models/Order.js"
import { generatePackingSlip } from "../services/packingSlipService.js"

const router = express.Router()

router.post("/", async (req, res) => {
  try {
    const { orderIds } = req.body

    const orders = await Order.find({
      _id: { $in: orderIds }
    })

    const pdf = await generatePackingSlip(orders)

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", "inline; filename=packing-slips.pdf")

    res.send(pdf)

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

export default router
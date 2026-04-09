import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= PUBLIC ORDER LOOKUP ================= */
router.post("/lookup", async (req, res) => {
  try {
    const { orderId, email } = req.body

    if (!orderId || !email) {
      return res.status(400).json({
        message: "Order ID and Email required"
      })
    }

    const order = await Order.findOne({
      _id: orderId,
      email: email.toLowerCase().trim()
    })

    if (!order) {
      return res.status(404).json({
        message: "Order not found"
      })
    }

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ LOOKUP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
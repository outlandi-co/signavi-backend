import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status
    order.status = status

    order.timeline = order.timeline || []
    order.timeline.push({
      status,
      date: new Date()
    })

    await order.save()

    req.app.get("io")?.emit("jobUpdated", order)

    await sendOrderStatusEmail(
      order.email || process.env.EMAIL_USER,
      status,
      order._id,
      order
    )

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json({ success: true, data: orders })
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ message: "Invalid ID" })
  }

  const order = await Order.findById(req.params.id)

  if (!order) {
    return res.status(404).json({ message: "Order not found" })
  }

  res.json({ success: true, data: order })
})

export default router
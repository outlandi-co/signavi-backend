import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= VALIDATION ================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🔥 UPDATE STATUS (FIXES 404 + DRAG)
========================================================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    console.log("🔥 PATCH STATUS HIT:", req.params.id, status)

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status
    order.status = status

    /* ================= TIMELINE ================= */
    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status,
      date: new Date(),
      note: `Moved from ${prevStatus} → ${status}`
    })

    await order.save()

    /* ================= SOCKET ================= */
    const io = req.app.get("io")
    if (io) {
      io.emit("jobUpdated", order)
    }

    /* ================= EMAIL ================= */
    try {
      await sendOrderStatusEmail(
        order.email || process.env.EMAIL_USER,
        status,
        order._id,
        order
      )
    } catch (err) {
      console.warn("⚠️ Email failed:", err.message)
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 GET ALL ORDERS
========================================================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 GET ONE ORDER
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({ success: true, data: order })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= STATUS (CRITICAL ROUTE FIRST) ================= */
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body

    if (!status) {
      return res.status(400).json({ message: "Status required" })
    }

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status

    /* 🔥 UPDATE STATUS */
    order.status = status

    /* 🔥 TIMELINE SAFE UPDATE */
    order.timeline = order.timeline || []

    if (prevStatus !== status) {
      order.timeline.push({
        status,
        date: new Date(),
        note: "Moved via production board"
      })
    }

    await order.save()

    console.log(`🔥 STATUS UPDATED: ${prevStatus} → ${status}`)

    /* 🔥 SOCKET UPDATE */
    req.app.get("io")?.emit("jobUpdated", order)

    /* 🔥 EMAIL (only if status changed) */
    if (prevStatus !== status) {
      await sendOrderStatusEmail(
        order.email || process.env.EMAIL_USER,
        status,
        order._id,
        order
      )
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
}

/* ✅ SUPPORT BOTH METHODS (prevents 404 mismatch bugs) */
router.patch("/:id/status", updateStatus)
router.put("/:id/status", updateStatus)

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ALL ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
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
    console.error("❌ GET ONE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
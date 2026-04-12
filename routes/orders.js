import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= TEST ================= */
router.get("/__test", (req, res) => {
  res.json({ message: "ORDERS ROUTE LIVE ✅" })
})

/* =========================================================
   🔥 PATCH MUST COME BEFORE /:id
========================================================= */
router.patch("/status/:id", async (req, res) => {
  try {
    const { status } = req.body

    console.log("🔥 PATCH HIT:", req.params.id, status)

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status
    order.status = status

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status,
      date: new Date(),
      note: `Moved from ${prevStatus} → ${status}`
    })

    await order.save()

    req.app.get("io")?.emit("jobUpdated", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json({ success: true, data: orders })
})

/* =========================================================
   🔥 THIS MUST BE LAST
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
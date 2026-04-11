import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= 🔥 STATUS ROUTES FIRST ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    console.log("🔥 HIT STATUS ROUTE")

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
      date: new Date(),
      note: "Moved via board"
    })

    await order.save()

    console.log(`🔥 STATUS UPDATED: ${prevStatus} → ${status}`)

    req.app.get("io")?.emit("jobUpdated", order)

    await sendOrderStatusEmail(
      order.email || process.env.EMAIL_USER,
      status,
      order._id,
      order
    )

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

router.put("/:id/status", async (req, res) => {
  req.method = "PATCH"
  return router.handle(req, res)
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

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  const order = await Order.create({
    ...req.body,
    timeline: [{ status: "created", date: new Date() }]
  })

  req.app.get("io")?.emit("jobCreated", order)

  res.status(201).json({ success: true, data: order })
})

export default router
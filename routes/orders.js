import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= HELPERS ================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ success: false, message: err.message })
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
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  try {
    const order = await Order.create({
      ...req.body,
      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Order created"
        }
      ]
    })

    console.log("🆕 ORDER CREATED:", order._id)

    req.app.get("io")?.emit("jobCreated", order)

    res.status(201).json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE ORDER ================= */
router.put("/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const updates = req.body

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (updates.email) {
      order.email = updates.email.toLowerCase().trim()
    }

    if (updates.price !== undefined) {
      order.price = Number(updates.price)
    }

    if (updates.finalPrice !== undefined) {
      order.finalPrice = Number(updates.finalPrice)
    }

    const prevStatus = order.status

    const allowedFields = [
      "customerName",
      "status",
      "quantity",
      "notes",
      "shippingAddress"
    ]

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        order[field] = updates[field]
      }
    })

    /* 🔥 TIMELINE TRACKING */
    if (updates.status && updates.status !== prevStatus) {
      order.timeline = order.timeline || []

      order.timeline.push({
        status: updates.status,
        date: new Date(),
        note: "Status updated"
      })
    }

    await order.save()

    console.log(`🔥 STATUS: ${prevStatus} → ${order.status}`)

    req.app.get("io")?.emit("jobUpdated", order)

    if (updates.status && updates.status !== prevStatus) {
      await sendOrderStatusEmail(
        order.email || process.env.EMAIL_USER,
        order.status,
        order._id,
        order
      )
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
const updateStatusHandler = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const { status, email, price, finalPrice } = req.body

    if (!status) {
      return res.status(400).json({ message: "Status is required" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (email) {
      order.email = email.toLowerCase().trim()
    }

    if (price !== undefined) {
      order.price = Number(price)
    }

    if (finalPrice !== undefined) {
      order.finalPrice = Number(finalPrice)
    }

    const prevStatus = order.status
    order.status = status

    /* 🔥 TIMELINE TRACKING */
    order.timeline = order.timeline || []

    if (status !== prevStatus) {
      order.timeline.push({
        status,
        date: new Date(),
        note: "Moved via board"
      })
    }

    await order.save()

    console.log(`🔥 STATUS UPDATED: ${prevStatus} → ${status}`)

    req.app.get("io")?.emit("jobUpdated", order)

    if (status !== prevStatus) {
      await sendOrderStatusEmail(
        order.email || process.env.EMAIL_USER,
        status,
        order._id,
        order
      )
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
}

/* ✅ SUPPORT BOTH */
router.put("/:id/status", updateStatusHandler)
router.patch("/:id/status", updateStatusHandler)

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  try {
    console.log("🧪 BEFORE DELETE:", req.params.id)

    const order = await Order.findByIdAndDelete(req.params.id)

    console.log("🧪 AFTER DELETE:", order)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    console.log("🗑️ ORDER DELETED:", req.params.id)

    req.app.get("io")?.emit("jobDeleted", req.params.id)

    res.json({
      message: "Order deleted",
      id: req.params.id
    })

  } catch (err) {
    console.error("❌ DELETE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
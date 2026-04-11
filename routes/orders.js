import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= HELPERS ================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= 🔥 STATUS ROUTE (NO COLLISION) ================= */
/* Changed from /:id/status → /status/:id */
router.patch("/status/:id", async (req, res) => {
  try {
    console.log("🔥 HIT STATUS ROUTE:", req.params.id)

    const { status } = req.body

    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    if (!status) {
      return res.status(400).json({ message: "Status required" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status
    order.status = status

    /* 🔥 TIMELINE */
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

    /* 🔥 REALTIME */
    req.app.get("io")?.emit("jobUpdated", order)

    /* 🔥 EMAIL */
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
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* (Optional) Support PUT as well */
router.put("/status/:id", async (req, res) => {
  req.method = "PATCH"
  return router.handle(req, res)
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
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

export default router
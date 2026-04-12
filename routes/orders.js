import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= VALIDATION ================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🔥 TEST ROUTE (VERY IMPORTANT FOR DEBUG)
========================================================= */
router.get("/__test", (req, res) => {
  res.json({ message: "ORDERS ROUTE LIVE ✅" })
})

/* =========================================================
   🔥 UPDATE STATUS (PRIMARY FIX)
========================================================= */
router.patch("/update-status/:id", async (req, res) => {
  try {
    const { status, trackingNumber, trackingLink, price, finalPrice, email } = req.body

    console.log("🔥 PATCH /update-status HIT:", req.params.id, status)

    /* VALIDATE ID */
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    /* FIND ORDER */
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status

    /* ================= UPDATE FIELDS ================= */
    if (status) order.status = status
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber
    if (trackingLink !== undefined) order.trackingLink = trackingLink
    if (price !== undefined) order.price = Number(price)
    if (finalPrice !== undefined) order.finalPrice = Number(finalPrice)
    if (email !== undefined) order.email = email

    /* ================= TIMELINE ================= */
    if (!order.timeline) order.timeline = []

    if (status && status !== prevStatus) {
      order.timeline.push({
        status,
        date: new Date(),
        note: `Moved from ${prevStatus} → ${status}`
      })
    }

    await order.save()

    /* ================= SOCKET ================= */
    const io = req.app.get("io")
    if (io) {
      io.emit("jobUpdated", order)
    }

    /* ================= EMAIL ================= */
    try {
      if (email) {
        await sendOrderStatusEmail(email, status, order._id, order)
      }
    } catch (err) {
      console.warn("⚠️ Email failed:", err.message)
    }

    /* ================= RESPONSE ================= */
    res.json({
      success: true,
      data: order
    })

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
   📦 GET ONE ORDER (KEEP LAST ALWAYS)
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
import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import fetch from "node-fetch"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* 🔥 SOCKET EMIT */
const emitOrderUpdate = (req, order) => {
  const io = req.app.get("io")

  if (io) {
    io.emit("orderUpdated", {
      orderId: order._id.toString(),
      order
    })
  }
}

/* ================= GET ALL ORDERS (🔥 FIXES 404) ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: orders
    })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CREATE ORDER ================= */
router.post("/", async (req, res) => {
  try {
    const { email, items } = req.body

    if (!email || !items?.length) {
      return res.status(400).json({ message: "Missing order data" })
    }

    let subtotal = 0

    const cleanItems = items.map(item => {
      const price = Number(item.price || 0)
      const quantity = Number(item.quantity || 1)

      subtotal += price * quantity

      return {
        name: item.name,
        price,
        quantity,
        variant: item.variant || {}
      }
    })

    const tax = subtotal * 0.0825
    const finalPrice = subtotal + tax

    const order = await Order.create({
      email,
      customerName: "Guest",
      items: cleanItems,
      subtotal,
      tax,
      finalPrice,
      status: "payment_required",
      timeline: [
        { status: "created", date: new Date() }
      ]
    })

    /* 🔥 EMAIL (SAFE) */
    try {
      await sendOrderStatusEmail(order.email, "payment_required", order._id, order)
    } catch (e) {
      console.warn("⚠️ Email failed (non-blocking)")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  const id = req.params.id.trim()

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID" })
  }

  const order = await Order.findById(id)
  if (!order) return res.status(404).json({ message: "Order not found" })

  res.json({ success: true, data: order })
})

/* ================= STATUS UPDATE ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    order.status = req.body.status

    order.timeline.push({
      status: req.body.status,
      date: new Date()
    })

    await order.save()

    emitOrderUpdate(req, order)

    /* 🔥 EMAIL (SAFE) */
    try {
      await sendOrderStatusEmail(order.email, order.status, order._id, order)
    } catch (e) {
      console.warn("⚠️ Email failed (non-blocking)")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CHECKOUT ================= */
router.patch("/:id/checkout", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    const baseUrl = "https://signavi-backend.onrender.com"

    console.log("💳 Creating payment for:", order._id)

    const response = await fetch(
      `${baseUrl}/api/square/create-payment/${order._id}`,
      { method: "POST" }
    )

    // 🔥 SAFE RESPONSE HANDLING
    if (!response.ok) {
      const text = await response.text()
      console.error("❌ Square API ERROR:", text)

      return res.status(500).json({
        message: "Payment provider error",
        details: text
      })
    }

    const data = await response.json()

    if (!data?.paymentUrl) {
      console.error("❌ No payment URL returned:", data)

      return res.status(500).json({
        message: "Payment failed",
        details: data
      })
    }

    /* ✅ SAVE ORDER */
    order.paymentUrl = data.paymentUrl
    order.status = "payment_required"

    await order.save()

    emitOrderUpdate(req, order)

    /* 🔥 EMAIL (SAFE) */
    try {
      await sendOrderStatusEmail(order.email, "payment_required", order._id, order)
    } catch (e) {
      console.warn("⚠️ Email failed (non-blocking)")
    }

    console.log("💳 PAYMENT LINK CREATED:", data.paymentUrl)

    res.json({
      success: true,
      paymentUrl: data.paymentUrl,
      orderId: order._id.toString()
    })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SHIP ================= */
router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    order.status = "shipped"

    order.timeline.push({
      status: "shipped",
      date: new Date()
    })

    await order.save()

    emitOrderUpdate(req, order)

    /* 🔥 EMAIL (SAFE) */
    try {
      await sendOrderStatusEmail(order.email, "shipped", order._id, order)
    } catch (e) {
      console.warn("⚠️ Email failed (non-blocking)")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
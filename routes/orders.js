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
      timeline: [{ status: "created", date: new Date() }]
    })

    // 🔥 EMAIL
    await sendOrderStatusEmail(order.email, "payment_required", order)

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

    // 🔥 EMAIL
    await sendOrderStatusEmail(order.email, order.status, order)

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

    const response = await fetch(
      `${baseUrl}/api/square/create-payment/${order._id}`,
      { method: "POST" }
    )

    const data = await response.json()

    if (!data?.paymentUrl) {
      return res.status(500).json({ message: "Payment failed" })
    }

    order.paymentUrl = data.paymentUrl
    order.status = "paid"

    await order.save()

    emitOrderUpdate(req, order)

    // 🔥 EMAIL
    await sendOrderStatusEmail(order.email, "paid", order)

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

    // 🔥 EMAIL
    await sendOrderStatusEmail(order.email, "shipped", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
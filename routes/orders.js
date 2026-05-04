import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import fetch from "node-fetch"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* ================= SOCKET ================= */
const emitOrderUpdate = (req, order) => {
  const io = req.app.get("io")
  if (io) {
    io.emit("orderUpdated", {
      orderId: order._id.toString(),
      order
    })
  }
}

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

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  try {
    const { email, items } = req.body

    if (!items || !items.length) {
      return res.status(400).json({ message: "No items provided" })
    }

    /* 🔥 FORCE VALID PRICES */
    const safeItems = items.map(item => {
      const price = Number(
        item.price ||
        item.selectedVariant?.price ||
        0
      )

      if (!price || price <= 0) {
        console.error("❌ INVALID ITEM PRICE:", item)
        throw new Error("Invalid item price")
      }

      return {
        name: item.name,
        quantity: Number(item.quantity || 1),
        price,
        variant: item.variant || item.selectedVariant
      }
    })

    /* 🔥 CALCULATE TOTALS */
    const subtotal = safeItems.reduce((sum, i) => {
      return sum + (i.price * i.quantity)
    }, 0)

    const tax = subtotal * 0.0825
    const finalPrice = subtotal + tax

    const order = await Order.create({
      email,
      items: safeItems,
      subtotal,
      tax,
      finalPrice,
      status: "payment_required",
      source: "store"
    })

    console.log("🧾 ORDER CREATED:", order._id)
    console.log("💰 ORDER TOTAL:", { subtotal, tax, finalPrice })

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
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

/* ================= STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    order.status = req.body.status
    order.timeline.push({ status: req.body.status, date: new Date() })

    await order.save()
    emitOrderUpdate(req, order)

    try {
      await sendOrderStatusEmail(order.email, order.status, order._id, order)
    } catch {
      console.warn("⚠️ Email failed")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CHECKOUT (🔥 FIXED) ================= */
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

    if (!response.ok) {
      const text = await response.text()
      console.error("❌ Square API ERROR:", text)

      return res.status(500).json({
        message: "Payment provider error",
        details: text
      })
    }

    const data = await response.json()

    console.log("🔥 SQUARE RESPONSE:", data)

    /* 🔥 FLEXIBLE URL HANDLING */
    const paymentUrl =
      data?.paymentUrl ||
      data?.checkoutUrl ||
      data?.url ||
      data?.link

    if (!paymentUrl) {
      console.error("❌ No valid payment URL:", data)

      return res.status(500).json({
        message: "Payment failed",
        details: data
      })
    }

    order.paymentUrl = paymentUrl
    order.status = "payment_required"

    await order.save()
    emitOrderUpdate(req, order)

    try {
      await sendOrderStatusEmail(order.email, "payment_required", order._id, order)
    } catch {
      console.warn("⚠️ Email failed")
    }

    console.log("💳 PAYMENT LINK CREATED:", paymentUrl)

    res.json({
      success: true,
      paymentUrl,
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
    order.timeline.push({ status: "shipped", date: new Date() })

    await order.save()
    emitOrderUpdate(req, order)

    try {
      await sendOrderStatusEmail(order.email, "shipped", order._id, order)
    } catch {
      console.warn("⚠️ Email failed")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
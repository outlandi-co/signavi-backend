import express from "express"
import axios from "axios"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()
const BASE_URL = process.env.BASE_URL || "http://localhost:5050"

/* ================= GET ALL ORDERS ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= 🔥 GET CUSTOMER ORDERS ================= */
router.get("/my-orders", async (req, res) => {
  try {
    const email = req.query.email?.toLowerCase()

    if (!email) {
      return res.status(400).json({ message: "Email required" })
    }

    const orders = await Order.find({ email }).sort({ createdAt: -1 })

    res.json({
      success: true,
      data: orders
    })

  } catch (err) {
    console.error("❌ MY ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CREATE ORDER ================= */
router.post("/", async (req, res) => {
  try {
    const { customerName, email, items = [] } = req.body

    if (!email || !items.length) {
      return res.status(400).json({ message: "Missing data" })
    }

    const subtotal = items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0
    )

    const tax = subtotal * 0.0825

    const order = new Order({
      customerName: customerName || "Guest",
      email: email.toLowerCase(),
      items,
      subtotal,
      tax,
      finalPrice: subtotal + tax,
      status: "payment_required",
      source: "store",
      timeline: [
        {
          status: "payment_required",
          note: "Order created",
          date: new Date()
        }
      ]
    })

    await order.save()

    await sendOrderStatusEmail(
      order.email,
      "payment_required",
      order._id,
      order
    )

    const io = req.app.get("io")
    io?.emit("jobUpdated")

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE (GENERAL PATCH) ================= */
router.patch("/:id", async (req, res) => {
  try {
    const update = req.body

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    )

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (update.status) {
      order.timeline.push({
        status: update.status,
        note: "Status updated",
        date: new Date()
      })

      await order.save()

      await sendOrderStatusEmail(
        order.email,
        update.status,
        order._id,
        order
      )

      const io = req.app.get("io")
      io?.emit("jobUpdated")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ PATCH ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS (SPECIFIC) ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, price, finalPrice, denialReason } = req.body

    const update = {}

    if (status) update.status = status
    if (price !== undefined) update.price = price
    if (finalPrice !== undefined) update.finalPrice = finalPrice
    if (denialReason) update.denialReason = denialReason

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    )

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (status) {
      order.timeline.push({
        status,
        note: "Status updated",
        date: new Date()
      })

      await order.save()

      await sendOrderStatusEmail(
        order.email,
        status,
        order._id,
        order
      )

      const io = req.app.get("io")
      io?.emit("jobUpdated")
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ UPDATE STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SHIP ================= */
router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order || !order.shippingAddress) {
      return res.status(400).json({ message: "Missing order or address" })
    }

    const shipRes = await axios.post(
      `${BASE_URL}/api/shipping/create-shipment`,
      {
        address_to: order.shippingAddress,
        rate_id: order.shippingRateId
      }
    )

    order.trackingNumber = shipRes.data.trackingNumber
    order.trackingLink = shipRes.data.trackingLink
    order.shippingLabel = shipRes.data.labelUrl
    order.status = "shipped"

    order.timeline.push({
      status: "shipped",
      note: "Order shipped",
      date: new Date()
    })

    await order.save()

    await sendOrderStatusEmail(
      order.email,
      "shipped",
      order._id,
      order
    )

    const io = req.app.get("io")
    io?.emit("jobUpdated")

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: "Shipping failed" })
  }
})

export default router
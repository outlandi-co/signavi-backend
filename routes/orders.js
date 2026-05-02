import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"

const router = express.Router()

/* =========================================================
   🔥 DEBUG: CONFIRM ROUTE LOADS (VERY IMPORTANT)
========================================================= */
console.log("🔥 ORDERS ROUTES ACTIVE")

/* =========================================================
   🛒 CREATE ORDER
========================================================= */
router.post("/", async (req, res) => {
  try {
    const { email, items } = req.body

    if (!email || !items || items.length === 0) {
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
        variant: item.variant || {},
        cost: item.cost || 0
      }
    })

    const TAX_RATE = 0.0825
    const tax = subtotal * TAX_RATE
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
        {
          status: "created",
          date: new Date(),
          note: "Order created"
        }
      ]
    })

    console.log("🛒 ORDER CREATED:", order._id)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 GET ALL
========================================================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ONE
========================================================= */
router.get("/:id", async (req, res) => {
  const { id } = req.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid order ID" })
  }

  try {
    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔥 UPDATE STATUS (CORE FIX)
========================================================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    console.log("📥 STATUS REQUEST:", req.params.id, status)

    if (!status) {
      return res.status(400).json({ message: "Missing status" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const allowedStatuses = [
      "payment_required",
      "ready_for_production",
      "production",
      "shipping",
      "shipped",
      "delivered"
    ]

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" })
    }

    order.status = status

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status,
      date: new Date(),
      note: `Moved to ${status}`
    })

    await order.save()

    console.log("🔄 STATUS UPDATED:", order._id, "→", status)

    /* 🔥 SOCKET UPDATE */
    const io = req.app.get("io")
    if (io) {
      io.emit("orderUpdated", order)
    }

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ STATUS UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💰 MARK PAID
========================================================= */
router.patch("/:id/mark-paid", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.status = "production"

    order.timeline.push({
      status: "paid",
      date: new Date(),
      note: "Payment received"
    })

    await order.save()

    console.log("💰 ORDER MARKED PAID:", order._id)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ MARK PAID ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.status = "shipped"

    order.timeline.push({
      status: "shipped",
      date: new Date(),
      note: "Order shipped"
    })

    await order.save()

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💳 CHECKOUT (SAVE SHIPPING + FINALIZE ORDER)
========================================================= */
router.patch("/:id/checkout", async (req, res) => {
  try {
    const {
      shippingAddress,
      shippingCost,
      carrier,
      serviceLevel
    } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    // 🔥 SAVE SHIPPING INFO
    order.shippingAddress = shippingAddress || order.shippingAddress
    order.shippingCost = Number(shippingCost || 0)
    order.carrier = carrier || order.carrier
    order.serviceLevel = serviceLevel || order.serviceLevel

    // 🔥 UPDATE FINAL PRICE
    order.finalPrice = (order.subtotal || 0) + (order.tax || 0) + order.shippingCost

    // 🔥 MOVE TO PAYMENT REQUIRED (or next step)
    order.status = "payment_required"

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status: "checkout",
      date: new Date(),
      note: "Checkout info saved"
    })

    await order.save()

    console.log("💳 CHECKOUT SAVED:", order._id)

    // 🔥 SOCKET UPDATE
    const io = req.app.get("io")
    if (io) io.emit("orderUpdated", order)

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
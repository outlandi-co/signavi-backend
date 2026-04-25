import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= CREATE ORDER ================= */
router.post("/", async (req, res) => {
  try {
    console.log("📦 INCOMING ORDER:", JSON.stringify(req.body, null, 2))

    const {
      customerName,
      email,
      items = []
    } = req.body

    /* 🔥 BASIC VALIDATION ONLY */
    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items are required" })
    }

    /* 🔥 SANITIZE ITEMS (NO HARD FAILS) */
    const cleanItems = items.map(item => ({
      productId: item.productId || item._id || item.id || null,
      name: item.name || "Item",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      variant: {
        color: item?.variant?.color || "",
        size: item?.variant?.size || ""
      }
    }))

    /* 🔥 CALCULATE TOTALS (BACKEND SOURCE OF TRUTH) */
    const subtotal = cleanItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity)
    }, 0)

    const taxRate = 0.0825
    const tax = subtotal * taxRate

    const finalPrice = subtotal + tax

    /* 🔥 CREATE ORDER */
    const order = new Order({
      customerName: customerName || "Guest",
      email,

      items: cleanItems,

      quantity: cleanItems.reduce((sum, i) => sum + i.quantity, 0),

      subtotal,
      tax,
      price: subtotal,
      finalPrice,

      status: "payment_required",
      source: "store"
    })

    await order.save()

    console.log("✅ ORDER CREATED:", order._id)

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: "Server error creating order" })
  }
})

/* ================= GET ALL (ADMIN) ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: orders
    })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: "Failed to fetch orders" })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({
      success: true,
      data: order
    })
  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: "Failed to fetch order" })
  }
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.status = status || order.status

    order.timeline.push({
      status: order.status,
      date: new Date(),
      note: "Status updated"
    })

    await order.save()

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ STATUS UPDATE ERROR:", err)
    res.status(500).json({ message: "Failed to update status" })
  }
})

export default router
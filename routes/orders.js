import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { requireAuth } from "../middleware/auth.js"
import jwt from "jsonwebtoken"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🆕 CREATE ORDER (GUEST + USER SUPPORT)
========================================================= */
router.post("/", async (req, res) => {
  try {
    console.log("🛒 CREATE ORDER HIT")

    let userId = null

    /* 🔐 OPTIONAL TOKEN */
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.id
        console.log("👤 AUTH USER:", userId)
      } catch (err) {
        console.log("⚠️ Guest checkout (invalid token)")
      }
    }

    let {
      customerName,
      email,
      items,
      quantity,
      printType,
      subtotal,
      tax,
      price
    } = req.body || {}

    /* ================= SAFE ITEMS ================= */
    const safeItems = Array.isArray(items)
      ? items.map(item => ({
          name: item?.name || "Item",
          quantity: Number(item?.quantity) || 1,
          price: Number(item?.price) || 0
        }))
      : []

    if (!safeItems.length) {
      console.error("❌ No items in order")
      return res.status(400).json({ message: "No items provided" })
    }

    /* ================= PRICING ================= */
    const computedSubtotal = safeItems.reduce(
      (acc, i) => acc + i.price * i.quantity,
      0
    )

    subtotal = Number(subtotal ?? computedSubtotal)
    tax = Number(tax ?? subtotal * 0.0825)
    price = Number(price ?? subtotal + tax)

    const totalQuantity =
      safeItems.reduce((acc, i) => acc + i.quantity, 0) ||
      Number(quantity) ||
      1

    /* ================= CREATE ================= */
    const order = await Order.create({
      user: userId,
      customerName: customerName || "Guest",
      email: email || "",
      items: safeItems,
      quantity: totalQuantity,
      printType: printType || "custom",
      subtotal,
      tax,
      price,
      finalPrice: price,
      source: "store",
      status: "payment_required",
      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Order created"
        }
      ]
    })

    console.log("✅ ORDER CREATED:", order._id)

    /* ================= EMAIL ================= */
    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "payment_required",
        order._id,
        order
      )
    }

    /* ================= SOCKET ================= */
    req.app.get("io")?.emit("jobCreated", order)

    /* ================= RESPONSE ================= */
    return res.status(201).json(order) // 🔥 IMPORTANT

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
    return res.status(500).json({
      message: "Order creation failed",
      error: err.message
    })
  }
})

/* =========================================================
   🔐 GET MY ORDERS
========================================================= */
router.get("/my-orders", requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user.id
    }).sort({ createdAt: -1 })

    res.json(orders)
  } catch (err) {
    console.error("❌ MY ORDERS ERROR:", err)
    res.status(500).json([])
  }
})

/* =========================================================
   🔄 UPDATE STATUS
========================================================= */
router.patch("/update-status/:id", requireAuth, async (req, res) => {
  try {
    const { status } = req.body
    const id = req.params.id

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (
      order.user?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" })
    }

    const prevStatus = order.status
    order.status = status

    if (!order.timeline) order.timeline = []

    if (status !== prevStatus) {
      order.timeline.push({
        status,
        date: new Date(),
        note: `${prevStatus} → ${status}`
      })
    }

    await order.save()

    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        status,
        order._id,
        order
      )
    }

    req.app.get("io")?.emit("jobUpdated", order)

    res.json(order)

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔐 GET ALL
========================================================= */
router.get("/", requireAuth, async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? {}
        : { user: req.user.id }

    const orders = await Order.find(query).sort({ createdAt: -1 })

    res.json(orders)
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json([])
  }
})

/* =========================================================
   🔐 GET ONE
========================================================= */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (
      order.user?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" })
    }

    res.json(order)

  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
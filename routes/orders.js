import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🆕 CREATE ORDER (SECURE + USER LINKED)
========================================================= */
router.post("/", requireAuth, async (req, res) => {
  try {
    console.log("🛒 CREATE ORDER HIT")
    console.log("👤 USER:", req.user.id)

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

    /* ================= CALCULATE ================= */
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

    console.log("💰 FINAL:", { subtotal, tax, total: price })

    /* ================= CREATE ORDER ================= */
    const order = await Order.create({
      userId: req.user.id, // 🔥 KEY LINE

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

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔄 UPDATE STATUS (ADMIN OR OWNER)
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

    /* 🔐 SECURITY CHECK */
    if (
      order.userId?.toString() !== req.user.id &&
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

    /* ================= EMAIL ================= */
    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        status,
        order._id,
        order
      )
    }

    req.app.get("io")?.emit("jobUpdated", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ALL (ONLY USER'S ORDERS)
========================================================= */
router.get("/", requireAuth, async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? {} // admin sees all
        : { userId: req.user.id } // user sees own

    const orders = await Order.find(query).sort({ createdAt: -1 })

    res.json({ success: true, data: orders })

  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ONE (SECURE)
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

    /* 🔐 SECURITY CHECK */
    if (
      order.userId?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" })
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🆕 CREATE ORDER (TAX + SAFE TOTAL SUPPORT)
========================================================= */
router.post("/", async (req, res) => {
  try {
    console.log("🛒 CREATE ORDER HIT")
    console.log("📦 BODY:", req.body)

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

    /* ================= CALCULATE FALLBACK ================= */
    const computedSubtotal = safeItems.reduce(
      (acc, i) => acc + i.price * i.quantity,
      0
    )

    subtotal = Number(subtotal ?? computedSubtotal)
    tax = Number(tax ?? subtotal * 0.08)
    price = Number(price ?? subtotal + tax)

    const totalQuantity =
      safeItems.reduce((acc, i) => acc + i.quantity, 0) ||
      Number(quantity) ||
      1

    console.log("💰 FINAL:", { subtotal, tax, total: price })

    /* ================= CREATE ORDER ================= */
    const order = await Order.create({
      customerName: customerName || "Guest",
      email: email || "",
      items: safeItems,

      quantity: totalQuantity,
      printType: printType || "custom",

      subtotal,   // ✅ NEW
      tax,        // ✅ NEW
      price,      // total
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
   🔄 UPDATE STATUS
========================================================= */
router.patch("/update-status/:id", async (req, res) => {
  try {
    const { status } = req.body
    const id = req.params.id

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ message: "Order not found" })

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
   📄 GET
========================================================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json({ success: true, data: orders })
})

router.get("/:id", async (req, res) => {
  const order = await Order.findById(req.params.id)
  res.json({ success: true, data: order })
})

export default router
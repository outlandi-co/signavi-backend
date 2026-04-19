import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= CREATE ORDER ================= */
router.post("/", async (req, res) => {
  try {
    const { customerName, email, items, quantity, printType } = req.body

    const safeItems = Array.isArray(items)
      ? items.map(item => ({
          name: item?.name || "Item",
          quantity: Number(item?.quantity) || 1,
          price: Number(item?.price) || 0
        }))
      : []

    const totalQuantity = safeItems.reduce((acc, i) => acc + i.quantity, 0)
    const totalPrice = safeItems.reduce((acc, i) => acc + i.price * i.quantity, 0)

    const order = await Order.create({
      customerName: customerName || "Guest",
      email: email || "",
      items: safeItems,
      quantity: totalQuantity || Number(quantity) || 1,
      printType: printType || "custom",
      price: totalPrice,
      finalPrice: totalPrice,
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

    /* 🔥 SEND EMAIL (optional) */
    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "payment_required",
        order._id,
        order
      )
    }

    req.app.get("io")?.emit("jobCreated", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
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

    /* 🔥 EMAIL */
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

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json({ success: true, data: orders })
})

router.get("/:id", async (req, res) => {
  const order = await Order.findById(req.params.id)
  res.json({ success: true, data: order })
})

export default router
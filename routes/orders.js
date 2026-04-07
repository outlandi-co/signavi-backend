import express from "express"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json(orders)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json(order)

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE ORDER (CATCH-ALL) ================= */
router.put("/:id", async (req, res) => {
  try {
    console.log("🚨 GENERAL UPDATE ROUTE HIT")

    const updates = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    /* 🔥 SAVE EMAIL */
    if (updates.email) {
      order.email = updates.email.toLowerCase().trim()
      console.log("📧 EMAIL SAVED:", order.email)
    }

    /* 🔥 SAVE PRICE */
    if (updates.price) {
      order.price = Number(updates.price)
    }

    if (updates.finalPrice) {
      order.finalPrice = Number(updates.finalPrice)
    }

    const prevStatus = order.status

    Object.assign(order, updates)
    await order.save()

    console.log("🔥 STATUS:", prevStatus, "→", order.status)

    /* 🔥 SEND EMAIL */
    if (updates.status) {
      console.log("📧 SENDING EMAIL FROM PUT ROUTE...")

      await sendOrderStatusEmail(
        order.email || process.env.EMAIL_USER,
        order.status,
        order._id,
        order
      )
    }

    res.json(order)

  } catch (err) {
    console.error("❌ UPDATE ERROR:", err.message)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
const updateStatusHandler = async (req, res) => {
  try {
    console.log("🚨 STATUS ROUTE HIT")

    const { status, email, price, finalPrice } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    /* 🔥 SAVE EMAIL */
    if (email) {
      order.email = email.toLowerCase().trim()
      console.log("📧 EMAIL SAVED TO ORDER:", order.email)
    }

    /* 🔥 SAVE PRICE (CRITICAL FIX) */
    if (price) {
      order.price = Number(price)
    }

    if (finalPrice) {
      order.finalPrice = Number(finalPrice)
    }

    const prevStatus = order.status

    order.status = status
    await order.save()

    console.log("🔥 STATUS UPDATED:", prevStatus, "→", status)
    console.log("💰 FINAL PRICE:", order.finalPrice || order.price)
    console.log("📧 ORDER EMAIL FIELD:", order.email)

    /* 🔥 SEND EMAIL */
    console.log("📧 CALLING EMAIL FUNCTION...")

    await sendOrderStatusEmail(
      order.email || process.env.EMAIL_USER,
      status,
      order._id,
      order
    )

    console.log("✅ EMAIL FUNCTION FINISHED")

    res.json(order)

  } catch (err) {
    console.error("❌ STATUS UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
}

/* ✅ SUPPORT BOTH */
router.put("/:id/status", updateStatusHandler)
router.patch("/:id/status", updateStatusHandler)

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({ message: "Order deleted" })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
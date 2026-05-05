import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import fetch from "node-fetch"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { generateInvoice } from "../utils/generateInvoice.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* ================= SOCKET ================= */
const emitOrderUpdate = (req, order) => {
  const io = req.app.get("io")
  if (io) {
    io.emit("jobUpdated", order) // 🔥 FIXED (matches frontend)
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

    const safeItems = items.map(item => {
      const price = Number(item.price || item.selectedVariant?.price || 0)

      if (!price || price <= 0) {
        throw new Error("Invalid item price")
      }

      return {
        name: item.name,
        quantity: Number(item.quantity || 1),
        price,
        variant: item.variant || item.selectedVariant
      }
    })

    const subtotal = safeItems.reduce((sum, i) => sum + (i.price * i.quantity), 0)
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

    /* 🔥 EMIT NEW ORDER */
    const io = req.app.get("io")
    if (io) io.emit("jobCreated", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE ================= */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { status, finalPrice, note } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    if (!order.timeline) order.timeline = []

    /* ================= PRICE ================= */
    if (finalPrice !== undefined) {
      const parsed = Number(finalPrice)
      if (!isNaN(parsed) && parsed > 0) {
        order.finalPrice = parsed
      }
    }

    /* ================= STATUS ================= */
    if (status) {
      const validStatuses = [
        "payment_required",
        "ready_for_production",
        "production",
        "shipping",
        "shipped",
        "denied"
      ]

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" })
      }

      order.status = status

      order.timeline.push({
        status,
        note: note || "",
        date: new Date()
      })
    }

    await order.save()

    emitOrderUpdate(req, order)

    /* ================= EMAIL ================= */
    try {
      await sendOrderStatusEmail(order.email, order.status, order)
    } catch (err) {
      console.warn("⚠️ Email failed:", err.message)
    }

    /* 🔥 AUTO INVOICE (OPTIONAL BUT POWERFUL) */
    if (status === "shipped") {
      try {
        const invoicePath = await generateInvoice(order)

        await sendOrderStatusEmail(
          order.email,
          "invoice",
          order,
          invoicePath
        )
      } catch (err) {
        console.warn("⚠️ Invoice generation failed:", err.message)
      }
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ UPDATE ORDER ERROR:", err)
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

    const paymentUrl =
      data?.paymentUrl ||
      data?.checkoutUrl ||
      data?.url

    if (!paymentUrl) {
      return res.status(500).json({ message: "Payment failed" })
    }

    order.paymentUrl = paymentUrl
    order.status = "payment_required"

    await order.save()
    emitOrderUpdate(req, order)

    await sendOrderStatusEmail(order.email, "payment_required", order)

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

/* ================= 🧾 INVOICE ROUTE ================= */
router.get("/:id/invoice", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const invoicePath = await generateInvoice(order)

    await sendOrderStatusEmail(
      order.email,
      "invoice",
      order,
      invoicePath
    )

    res.json({
      success: true,
      message: "Invoice sent",
      file: invoicePath
    })

  } catch (err) {
    console.error("❌ INVOICE ERROR:", err)
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

    await sendOrderStatusEmail(order.email, "shipped", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
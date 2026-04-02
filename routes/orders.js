import express from "express"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { createShippingLabel } from "../services/shippingService.js"

const router = express.Router()

/* ================= GET ALL ORDERS ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json(orders)
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET SINGLE ORDER (TRACKING PAGE) ================= */
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json(order)
  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params
    let { status } = req.body

    if (!status) {
      return res.status(400).json({ message: "Status is required" })
    }

    /* ================= UI → DB STATUS MAP ================= */
    const statusMap = {
    production: "paid",
    shipped: "shipped",
    shipping: "shipped" // 🔥 FIX
  }

    const mappedStatus = statusMap[status] || status

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    /* ================= UPDATE ================= */
    if (!order.timeline) order.timeline = []

    order.status = mappedStatus

    const lastStatus = order.timeline?.[order.timeline.length - 1]?.status

    if (lastStatus !== mappedStatus) {
    order.timeline.push({
    status: mappedStatus,
    date: new Date()
    })
}

    /* ================= 🚀 SHIPPING TRIGGER ================= */
    if (mappedStatus === "shipped" && !order.trackingNumber) {

      console.log("📦 Creating shipping label...")

      try {
        const shipment = await createShippingLabel(order)

        order.trackingNumber = shipment.trackingNumber
        order.trackingLink = shipment.trackingLink
        order.shippingLabel = shipment.labelUrl

        console.log("✅ SHIPPING CREATED:", shipment.trackingNumber)

      } catch (err) {
        console.error("❌ SHIPPING ERROR:", err.message)
      }
    }

    await order.save()

    /* ================= SOCKET ================= */
    req.app.get("io")?.emit("jobUpdated", order)

    /* ================= EMAIL ================= */
    const email = order.email?.trim()

    if (email && email.includes("@")) {
      try {

        if (mappedStatus === "payment_required") {
          await sendOrderStatusEmail(email, "payment_required", order._id, order)
        }

        if (mappedStatus === "paid") {
          await sendOrderStatusEmail(email, "paid", order._id, order)
        }

        if (mappedStatus === "shipped") {
          await sendOrderStatusEmail(email, "shipped", order._id, order)
        }

        if (mappedStatus === "delivered") {
        await sendOrderStatusEmail(email, "delivered", order._id, order)
        }

      } catch (err) {
        console.error("❌ EMAIL ERROR:", err.message)
      }
    }

    res.json({
      success: true,
      order
    })

  } catch (err) {
    console.error("❌ STATUS UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
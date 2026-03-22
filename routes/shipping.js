import express from "express"
import Order from "../models/Order.js"
import { getTrackingLink } from "../utils/tracking.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

router.patch("/:id/tracking", async (req, res) => {
  try {
    const { trackingNumber } = req.body

    if (!trackingNumber) {
      return res.status(400).json({ message: "Tracking required" })
    }

    console.log("🔍 PARAM ID:", req.params.id)

const order = await Order.findOne({ _id: req.params.id })

console.log("📦 ORDER FOUND:", order)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const trackingLink = getTrackingLink(trackingNumber)

    const alreadyShipped = order.status === "shipped"

    order.trackingNumber = trackingNumber
    order.trackingLink = trackingLink
    order.status = "shipped"

    if (!alreadyShipped) {
      order.timeline.push({ status: "shipped", date: new Date() })
    }

    await order.save()

    console.log("📦 Tracking added:", order._id)

    /* 📧 EMAIL */
    sendOrderStatusEmail(
      order.email,
      "shipped",
      order.orderId,
      null,
      trackingNumber
    )

    req.app.get("io").emit("jobUpdated")

    res.json(order)

  } catch (err) {
    console.error("❌ Tracking error:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
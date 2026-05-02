import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

/* ================= STRIPE INIT ================= */
let stripe = null

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  })
  console.log("💳 Stripe initialized (checkout)")
} else {
  console.warn("⚠️ STRIPE_SECRET_KEY missing — Stripe disabled")
}

/* ================= CREATE CHECKOUT ================= */
router.patch("/:id/checkout", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    /* ================= SAVE SHIPPING ================= */
    if (req.body?.shippingAddress) {
      order.shippingAddress = req.body.shippingAddress
      order.shippingCost = req.body.shippingCost || 0
      order.carrier = req.body.carrier || ""
      order.serviceLevel = req.body.serviceLevel || ""
    }

    /* ================= ENSURE TIMELINE EXISTS ================= */
    if (!Array.isArray(order.timeline)) {
      order.timeline = []
    }

    /* ================= GENERATE PAYMENT URL ================= */
    const paymentUrl = `https://signavistudio.store/checkout/${order._id}`

    order.paymentUrl = paymentUrl
    order.status = "payment_required"

    order.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Checkout started"
    })

    await order.save()

    return res.json({
      success: true,
      paymentUrl
    })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)

    return res.status(500).json({
      success: false,
      message: err.message || "Checkout failed"
    })
  }
})

export default router
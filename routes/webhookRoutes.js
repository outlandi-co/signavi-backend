import express from "express"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   💳 CONFIRM PAYMENT (SQUARE FLOW)
   This is called from:
   /success/:id page OR Square redirect
========================================================= */
router.post("/confirm/:id", async (req, res) => {
  try {
    const orderId = req.params.id

    console.log("💳 CONFIRM PAYMENT HIT:", orderId)

    const order = await Order.findById(orderId)

    if (!order) {
      console.warn("❌ Order not found:", orderId)
      return res.status(404).json({ message: "Order not found" })
    }

    /* 🔒 prevent duplicate processing */
    if (order.status === "paid") {
      console.log("⚠️ Already paid:", orderId)
      return res.json({ success: true, data: order })
    }

    /* ================= UPDATE ================= */
    if (!order.timeline) order.timeline = []

    order.status = "paid"
    order.productionStatus = "queued"

    order.timeline.push({
      status: "paid",
      date: new Date(),
      note: "Payment confirmed via Square"
    })

    await order.save()

    console.log("✅ ORDER MARKED PAID:", orderId)

    /* ================= SOCKET ================= */
    const io = req.app.get("io")
    if (io) {
      io.emit("jobUpdated", order)
    }

    /* ================= EMAIL ================= */
    if (order.email) {
      try {
        await sendOrderStatusEmail(
          order.email,
          "paid",
          order._id,
          order
        )
      } catch (err) {
        console.error("⚠️ EMAIL FAILED:", err.message)
      }
    }

    res.json({
      success: true,
      message: "Payment confirmed",
      data: order
    })

  } catch (err) {
    console.error("❌ CONFIRM ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🧪 TEST ROUTE
========================================================= */
router.get("/test/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    res.json(order)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
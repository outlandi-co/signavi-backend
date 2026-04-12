import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= VALIDATION ================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🔥 TEST ROUTE (DEBUG)
========================================================= */
router.get("/__test", (req, res) => {
  res.json({ message: "ORDERS ROUTE LIVE ✅" })
})

/* =========================================================
   🛒 CREATE ORDER (🔥 REQUIRED FOR CART CHECKOUT)
========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      customerName,
      email,
      items,
      quantity,
      printType,
      source
    } = req.body

    const order = await Order.create({
      customerName: customerName || "Guest",
      email: email || "",
      items: items || [],
      quantity: quantity || 1,
      printType: printType || "custom",
      source: source || "store",
      status: "payment_required",

      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Order created from cart"
        }
      ]
    })

    console.log("✅ ORDER CREATED:", order._id)

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔥 SHARED STATUS HANDLER (ONE SOURCE OF TRUTH)
========================================================= */
const updateStatusHandler = async (req, res) => {
  try {
    const { status, trackingNumber, trackingLink, price, finalPrice, email } = req.body
    const id = req.params.id

    console.log("🔥 STATUS UPDATE HIT:", id, status)

    /* VALIDATE */
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const prevStatus = order.status

    /* ================= UPDATE FIELDS ================= */
    if (status) order.status = status
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber
    if (trackingLink !== undefined) order.trackingLink = trackingLink
    if (price !== undefined) order.price = Number(price)
    if (finalPrice !== undefined) order.finalPrice = Number(finalPrice)
    if (email !== undefined) order.email = email

    /* ================= TIMELINE ================= */
    if (!order.timeline) order.timeline = []

    if (status && status !== prevStatus) {
      order.timeline.push({
        status,
        date: new Date(),
        note: `Moved from ${prevStatus} → ${status}`
      })
    }

    await order.save()

    /* ================= SOCKET ================= */
    const io = req.app.get("io")
    if (io) io.emit("jobUpdated", order)

    /* ================= EMAIL ================= */
    try {
      if (email) {
        await sendOrderStatusEmail(email, status, order._id, order)
      }
    } catch (err) {
      console.warn("⚠️ Email failed:", err.message)
    }

    /* ================= RESPONSE ================= */
    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
}

/* =========================================================
   🔥 SUPPORT ALL FRONTEND ROUTES
========================================================= */
router.patch("/update-status/:id", updateStatusHandler)
router.patch("/:id/status", updateStatusHandler)
router.patch("/status/:id", updateStatusHandler)

/* =========================================================
   📦 GET ALL ORDERS
========================================================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 GET ONE ORDER
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({ success: true, data: order })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
console.log("🔥 orders.js LOADED")

import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import nodemailer from "nodemailer"
import path from "path"
import fs from "fs"

const router = express.Router()

/* ================= EMAIL SETUP ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* ===================================================== */
/* 🔥 SEND ARTWORK (FIXED — SUPPORTS ORDER + QUOTE) */
/* ===================================================== */
router.post("/send-artwork/:id", async (req, res) => {
  try {
    console.log("🔥 SEND ARTWORK HIT:", req.params.id)

    let order = await Order.findById(req.params.id)
    let source = "order"

    if (!order) {
      order = await Quote.findById(req.params.id)
      source = "quote"
    }

    if (!order) {
      console.log("❌ NOT FOUND IN ORDER OR QUOTE:", req.params.id)
      return res.status(404).json({ message: "Order not found" })
    }

    console.log(`✅ FOUND IN ${source.toUpperCase()}`)

    if (!order.artwork) {
      console.log("❌ No artwork on record")
      return res.status(400).json({ message: "No artwork uploaded" })
    }

    const filePath = path.resolve("uploads", order.artwork)

    console.log("📁 FILE PATH:", filePath)

    if (!fs.existsSync(filePath)) {
      console.log("❌ FILE NOT FOUND")
      return res.status(404).json({ message: "File not found" })
    }

    /* ================= UPDATE STATUS ================= */
    order.status = "artwork_sent"

    order.timeline = order.timeline || []
    order.timeline.push({
      status: "artwork_sent",
      note: "Artwork emailed to client",
      date: new Date()
    })

    await order.save()

    /* ================= SEND EMAIL ================= */
    try {
      await transporter.sendMail({
        from: `"Signavi" <${process.env.EMAIL_USER}>`,
        to: order.email || process.env.EMAIL_USER,
        subject: `🎨 Artwork - Order ${order._id}`,
        text: `Artwork attached for order ${order._id}`,
        attachments: [
          {
            filename: order.artwork,
            path: filePath
          }
        ]
      })

      console.log("📧 EMAIL SENT")

    } catch (emailErr) {
      console.error("❌ EMAIL FAILED:", emailErr)
    }

    /* ================= SOCKET UPDATE ================= */
    req.app.get("io")?.emit("jobUpdated")

    res.json({
      success: true,
      message: "Artwork sent successfully",
      order
    })

  } catch (err) {
    console.error("❌ SEND ARTWORK ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json(orders)
  } catch (err) {
    console.error("❌ GET ALL:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id/client", async (req, res) => {
  try {
    let order = await Order.findById(req.params.id)

    if (!order) {
      order = await Quote.findById(req.params.id)
    }

    if (!order) return res.status(404).json({ message: "Not found" })

    res.json(order)

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status,
        $push: {
          timeline: {
            status: req.body.status,
            note: "Manual move",
            date: new Date()
          }
        }
      },
      { new: true }
    )

    req.app.get("io")?.emit("jobUpdated")
    res.json(updated)

  } catch (err) {
    console.error("❌ STATUS:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= APPROVE ================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const price = Number(req.body.price || 0)
    const shipping = Number(req.body.shipping || 0)

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: "approved",
        status: "approved",
        approvedAt: new Date(),
        price,
        shippingCost: shipping,
        finalPrice: price + shipping,
        $push: {
          timeline: {
            status: "approved",
            note: `Approved $${price + shipping}`,
            date: new Date()
          }
        }
      },
      { new: true }
    )

    if (!order) return res.status(404).json({ message: "Order not found" })

    req.app.get("io")?.emit("jobUpdated")
    res.json(order)

  } catch (err) {
    console.error("❌ APPROVE:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= DENY ================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: "denied",
        status: "denied",
        $push: {
          timeline: {
            status: "denied",
            date: new Date()
          }
        }
      },
      { new: true }
    )

    if (!order) return res.status(404).json({ message: "Order not found" })

    req.app.get("io")?.emit("jobUpdated")
    res.json(order)

  } catch (err) {
    console.error("❌ DENY:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= TRACKING ================= */
router.patch("/:id/tracking", async (req, res) => {
  try {
    const { trackingNumber, trackingLink } = req.body

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        trackingNumber,
        trackingLink,
        status: "shipped",
        shippedAt: new Date(),
        $push: {
          timeline: {
            status: "shipped",
            note: `Tracking ${trackingNumber}`,
            date: new Date()
          }
        }
      },
      { new: true }
    )

    if (!order) return res.status(404).json({ message: "Order not found" })

    req.app.get("io")?.emit("jobUpdated")
    res.json(order)

  } catch (err) {
    console.error("❌ TRACKING:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
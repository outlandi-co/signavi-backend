import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

console.log("🔥 QUOTES ROUTE LOADED")

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json({ success: true, data: quotes })
  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  try {
    const quote = await Quote.create({
      ...req.body,
      quantity: Number(req.body.quantity) || 0,
      price: Number(req.body.price) || 0,
      finalPrice: Number(req.body.price) || 0,
      status: "quotes",
      approvalStatus: "pending",
      timeline: [
        { status: "created", note: "Quote created" }
      ]
    })

    res.status(201).json({ success: true, data: quote })
  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    res.json({ success: true, data: quote })
  } catch (err) {
    console.error("❌ GET ONE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= PATCH ================= */
router.patch("/:id", async (req, res) => {
  try {
    console.log("🔥 PATCH BODY:", req.body)

    const quote = await Quote.findById(req.params.id)
    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (!Array.isArray(quote.timeline)) {
      quote.timeline = []
    }

    /* ================= APPROVE ================= */
    if (req.body.approvalStatus === "approved") {
      quote.approvalStatus = "approved"
      quote.status = "payment_required"

      quote.timeline.push({
        status: "approved",
        note: "Quote approved → creating order"
      })

      const order = await Order.create({
        customerName: quote.customerName,
        email: quote.email,
        items: [
          {
            name: quote.projectType || "Custom Order",
            quantity: quote.quantity || 1,
            price: quote.price || 0
          }
        ],
        subtotal: quote.price || 0,
        tax: (quote.price || 0) * 0.0825,
        finalPrice: (quote.price || 0) * 1.0825,
        status: "payment_required",
        source: "quote"
      })

      console.log("🔥 ORDER CREATED:", order._id)

      /* 🔥 ALWAYS SEND EMAIL (NO CONDITION BLOCK) */
      await sendOrderStatusEmail(
        order.email,
        "payment_required",
        order
      )

      console.log("📧 EMAIL TRIGGERED")
    }

    /* ================= DENY ================= */
    if (req.body.approvalStatus === "denied") {
      quote.approvalStatus = "denied"
      quote.status = "denied"

      quote.timeline.push({
        status: "denied",
        note: "Quote denied"
      })

      /* 🔥 ALWAYS SEND EMAIL */
      await sendOrderStatusEmail(
        quote.email,
        "denied",
        quote
      )

      console.log("📧 DENIAL EMAIL TRIGGERED")
    }

    await quote.save()

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ PATCH ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
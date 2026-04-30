import express from "express"
import mongoose from "mongoose"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= HELPER ================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* ================= CREATE QUOTE ================= */
router.post("/", async (req, res) => {
  try {
    const { customerName, email, quantity, notes } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email required" })
    }

    const quote = new Quote({
      customerName: customerName || "Guest",
      email: email.toLowerCase(),
      quantity: Number(quantity) || 1,
      notes: notes || "",
      price: 0,
      shippingCost: 0,
      approvalStatus: "pending",
      status: "quotes",
      source: "quote",
      timeline: [
        {
          status: "quotes",
          note: "Quote submitted",
          date: new Date()
        }
      ]
    })

    await quote.save()
    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json({ success: true, data: quotes })
  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    res.status(500).json({ message: "Failed to load quotes" })
  }
})

/* =========================================================
   🔥 APPROVE (FIXED)
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    // 🔥 CRITICAL FIX: REQUIRE PRICE
    if (!quote.price || quote.price <= 0) {
      return res.status(400).json({
        message: "⚠️ Set price before approving this quote"
      })
    }

    quote.approvalStatus = "approved"
    quote.status = "payment_required"

    quote.timeline.push({
      status: "approved",
      note: "Quote approved",
      date: new Date()
    })

    await quote.save()

    // 🔥 DEBUG + EMAIL FIX
    console.log("📧 ATTEMPTING EMAIL:", quote.email)

    try {
      await sendOrderStatusEmail(
        quote.email,
        "payment_required", // ✅ matches your email system
        quote._id,
        quote
      )
    } catch (emailErr) {
      console.error("❌ EMAIL FAIL (APPROVE):", emailErr)
    }

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔥 DENY
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const { id } = req.params

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    const reason = req.body?.reason || "Not specified"

    quote.approvalStatus = "denied"
    quote.status = "denied"
    quote.denialReason = reason

    quote.timeline.push({
      status: "denied",
      note: "Quote denied",
      date: new Date()
    })

    await quote.save()

    console.log("📧 ATTEMPTING EMAIL (DENY):", quote.email)

    try {
      await sendOrderStatusEmail(
        quote.email,
        "denied",
        quote._id,
        quote
      )
    } catch (emailErr) {
      console.error("❌ EMAIL FAIL (DENY):", emailErr)
    }

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ GET ONE ERROR:", err)
    res.status(500).json({ message: "Failed to load quote" })
  }
})

export default router
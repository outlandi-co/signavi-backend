import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import upload from "../middleware/upload.js" // 🔥 NEW

const router = express.Router()

/* =========================================================
   📥 CREATE QUOTE (🔥 FIXED WITH IMAGE UPLOAD)
========================================================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("📦 FILE:", req.file)

    const quote = await Quote.create({
      customerName: req.body.customerName,
      email: req.body.email,
      quantity: req.body.quantity,
      price: req.body.price,
      notes: req.body.notes,

      // 🔥 THIS IS THE FIX
      artwork: req.file?.path || "" 
    })

    res.json(quote)

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📥 GET ALL QUOTES
========================================================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* =========================================================
   📥 GET SINGLE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json(quote)
  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* =========================================================
   ✅ APPROVE QUOTE
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    console.log("🔥 APPROVE ROUTE HIT:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "approved"
    quote.status = "payment_required"

    if (!quote.timeline) quote.timeline = []

    quote.timeline.push({
      status: "approved",
      date: new Date()
    })

    await quote.save()

    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        quote
      )
    }

    const io = req.app.get("io")
    if (io) {
      io.emit("jobUpdated", quote)
    }

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ❌ DENY QUOTE
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    console.log("❌ DENY ROUTE HIT:", req.params.id)

    const { reason, fee } = req.body

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "denied"
    quote.denialReason = reason || "Artwork issue"
    quote.revisionFee = Number(fee) || 0

    if (!quote.timeline) quote.timeline = []

    quote.timeline.push({
      status: "denied",
      date: new Date(),
      note: reason || "Artwork issue"
    })

    await quote.save()

    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "denied",
        quote._id,
        quote
      )
    }

    const io = req.app.get("io")
    if (io) {
      io.emit("jobUpdated", quote)
    }

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
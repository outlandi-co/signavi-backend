import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   📥 GET ALL QUOTES
========================================================= */
router.get("/", async (req, res) => {
  const quotes = await Quote.find().sort({ createdAt: -1 })
  res.json(quotes)
})

/* =========================================================
   📥 GET SINGLE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  const quote = await Quote.findById(req.params.id)
  res.json(quote)
})

/* =========================================================
   ✅ APPROVE QUOTE
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "approved"
    quote.status = "payment_required" // 🔥 move to next stage

    await quote.save()

    /* 📧 EMAIL */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        quote
      )
    }

    res.json({ success: true, quote })

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
    const { reason, fee } = req.body

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "denied"
    quote.denialReason = reason || "Artwork issue"
    quote.revisionFee = Number(fee) || 0

    await quote.save()

    /* 📧 EMAIL */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "denied",
        quote._id,
        quote
      )
    }

    res.json({ success: true, quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
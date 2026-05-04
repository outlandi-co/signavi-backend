import express from "express"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json({ success: true, data: quote })
  } catch (error) {
    console.error("❌ GET QUOTE ERROR:", error)
    res.status(500).json({ message: "Server error" })
  }
})

/* ================= UPDATE / APPROVE ================= */
router.patch("/:id", async (req, res) => {
  try {
    console.log("🔥 PATCH BODY:", req.body)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    /* ================= SAFE TIMELINE INIT ================= */
    if (!quote.timeline) quote.timeline = []

    /* ================= APPROVAL LOGIC ================= */
    if (req.body.approvalStatus === "approved") {
      quote.approvalStatus = "approved"
      quote.status = "payment_required"

      quote.timeline.push({
        status: "approved",
        note: "Quote approved — awaiting payment"
      })
    }

    if (req.body.approvalStatus === "denied") {
      quote.approvalStatus = "denied"
      quote.status = "denied"
      quote.denialReason = req.body.denialReason || ""

      quote.timeline.push({
        status: "denied",
        note: quote.denialReason || "Quote denied"
      })
    }

    /* ================= GENERIC SAFE UPDATES ================= */
    const allowedFields = [
      "customerName",
      "email",
      "quantity",
      "price",
      "finalPrice",
      "notes",
      "adminNotes"
    ]

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        quote[field] = req.body[field]
      }
    })

    /* ================= SAVE ================= */
    await quote.save()

    console.log("✅ Quote updated:", quote._id)

    res.json({ success: true, data: quote })
  } catch (error) {
    console.error("❌ UPDATE ERROR:", error)

    res.status(500).json({
      message: "Update failed",
      error: error.message
    })
  }
})

export default router
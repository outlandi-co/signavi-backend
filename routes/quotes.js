import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

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

    /* ================= SAFE TIMELINE ================= */
    if (!quote.timeline) quote.timeline = []

    /* ================= TRACK ORIGINAL STATE ================= */
    const prevApproval = quote.approvalStatus

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

    /* ================= APPROVAL LOGIC ================= */

    /* ===== APPROVED ===== */
    if (req.body.approvalStatus === "approved") {
      quote.approvalStatus = "approved"
      quote.status = "payment_required"

      quote.timeline.push({
        status: "approved",
        note: "Quote approved — awaiting payment"
      })

      /* 🔥 SEND EMAIL ONLY IF NEW APPROVAL */
      if (prevApproval !== "approved") {
        await sendOrderStatusEmail(
          quote.email,
          "payment_required",
          quote
        )
        console.log("📧 Approval email sent")
      }
    }

    /* ===== DENIED ===== */
    if (req.body.approvalStatus === "denied") {
      quote.approvalStatus = "denied"
      quote.status = "denied"
      quote.denialReason = req.body.denialReason || ""

      quote.timeline.push({
        status: "denied",
        note: quote.denialReason || "Quote denied"
      })

      /* 🔥 SEND EMAIL ONLY IF NEW DENIAL */
      if (prevApproval !== "denied") {
        await sendOrderStatusEmail(
          quote.email,
          "denied",
          quote
        )
        console.log("📧 Denial email sent")
      }
    }

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
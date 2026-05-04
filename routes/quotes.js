import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })

    return res.json({
      success: true,
      data: quotes
    })
  } catch (error) {
    console.error("❌ GET ALL QUOTES ERROR:", error)
    return res.status(500).json({ message: "Server error" })
  }
})

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  try {
    console.log("📤 SENDING QUOTE JSON:", req.body)

    const {
      customerName,
      email,
      quantity,
      price
    } = req.body

    /* 🔥 BASIC VALIDATION */
    if (!customerName || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      })
    }

    const quote = new Quote({
      ...req.body,
      quantity: Number(quantity) || 0,
      price: Number(price) || 0,
      finalPrice: Number(price) || 0,

      status: "quotes",
      approvalStatus: "pending",

      timeline: [
        {
          status: "created",
          note: "Quote created"
        }
      ]
    })

    await quote.save()

    console.log("✅ Quote created:", quote._id)

    return res.status(201).json({
      success: true,
      data: quote
    })
  } catch (error) {
    console.error("❌ CREATE QUOTE ERROR:", error)

    return res.status(500).json({
      message: "Create failed",
      error: error.message
    })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    return res.json({ success: true, data: quote })
  } catch (error) {
    console.error("❌ GET QUOTE ERROR:", error)
    return res.status(500).json({ message: "Server error" })
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
    if (!Array.isArray(quote.timeline)) {
      quote.timeline = []
    }

    const prevApproval = quote.approvalStatus

    /* ================= SAFE UPDATES ================= */
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
        quote[field] =
          field === "price" || field === "finalPrice" || field === "quantity"
            ? Number(req.body[field])
            : req.body[field]
      }
    })

    /* ================= APPROVE ================= */
    if (req.body.approvalStatus === "approved") {
      quote.approvalStatus = "approved"
      quote.status = "payment_required"

      quote.timeline.push({
        status: "approved",
        note: "Quote approved — awaiting payment"
      })

      if (prevApproval !== "approved") {
        try {
          await sendOrderStatusEmail(
            quote.email,
            "payment_required",
            quote
          )
          console.log("📧 Approval email sent")
        } catch (emailErr) {
          console.error("❌ EMAIL ERROR:", emailErr)
        }
      }
    }

    /* ================= DENY ================= */
    if (req.body.approvalStatus === "denied") {
      quote.approvalStatus = "denied"
      quote.status = "denied"
      quote.denialReason = req.body.denialReason || ""

      quote.timeline.push({
        status: "denied",
        note: quote.denialReason || "Quote denied"
      })

      if (prevApproval !== "denied") {
        try {
          await sendOrderStatusEmail(
            quote.email,
            "denied",
            quote
          )
          console.log("📧 Denial email sent")
        } catch (emailErr) {
          console.error("❌ EMAIL ERROR:", emailErr)
        }
      }
    }

    await quote.save()

    console.log("✅ Quote updated:", quote._id)

    return res.json({
      success: true,
      data: quote
    })
  } catch (error) {
    console.error("❌ UPDATE ERROR:", error)

    return res.status(500).json({
      message: "Update failed",
      error: error.message
    })
  }
})

export default router
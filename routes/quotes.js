import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   🆕 CREATE QUOTE
========================================================= */
router.post("/", async (req, res) => {
  console.log("🔥 CREATE QUOTE HIT")
  console.log("📦 BODY:", req.body)

  try {
    const {
      customerName,
      email,
      quantity,
      printType,
      price,
      items
    } = req.body

    const quote = new Quote({
      customerName: customerName || "New Customer",
      email: email || "",
      quantity: Number(quantity || 1),
      printType: printType || "unknown",
      price: Number(price || 25),
      items: items || [],
      status: "pending",
      approvalStatus: "pending",
      source: "quote",
      timeline: [
        {
          status: "pending",
          date: new Date(),
          note: "Quote created"
        }
      ]
    })

    await quote.save()

    console.log("✅ QUOTE CREATED:", quote._id)

    try {
      const io = req.app.get("io")
      if (io) io.emit("jobCreated", quote)
    } catch (err) {
      console.warn("⚠️ Socket failed:", err.message)
    }

    return res.status(201).json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    return res.status(500).json({
      message: err.message || "Failed to create quote"
    })
  }
})

/* =========================================================
   📄 GET ALL QUOTES (optional but useful)
========================================================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    res.status(500).json({ message: "Server error" })
  }
})

/* =========================================================
   📄 GET ONE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json(quote)
  } catch (err) {
    res.status(500).json({ message: "Server error" })
  }
})

/* =========================================================
   ✅ APPROVE
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  console.log("🚨 APPROVE HIT")

  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    let price = Number(req.body?.price)
    if (price > 0) quote.price = price
    if (!quote.price || quote.price <= 0) quote.price = 25

    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    quote.timeline = quote.timeline || []
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("✅ APPROVED:", quote._id)

    /* SOCKET */
    try {
      const io = req.app.get("io")
      if (io) io.emit("jobUpdated", quote)
    } catch (err) {}

    /* EMAIL */
    if (quote.email) {
      sendOrderStatusEmail(
        quote.email,
        "payment_required",
        quote._id,
        quote.toObject()
      ).catch(err => {
        console.warn("⚠️ Email failed:", err.message)
      })
    }

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ❌ DENY
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Not found" })
    }

    quote.approvalStatus = "denied"
    quote.denialReason = req.body.reason || ""
    quote.revisionFee = Number(req.body.fee || 0)

    await quote.save()

    try {
      const io = req.app.get("io")
      if (io) io.emit("jobUpdated", quote)
    } catch (e) {}

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
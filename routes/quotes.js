import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   📄 GET ONE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    return res.json(quote)

  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ✅ APPROVE (FINAL STABLE)
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  console.log("🚨 APPROVE vFINAL BUILD 🔥🔥🔥")
  console.log("📦 BODY:", req.body)

  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    console.log("🧪 FOUND QUOTE:", quote._id)

    /* ================= PRICE ================= */
    let incomingPrice = Number(req.body?.price)

    if (incomingPrice > 0) {
      quote.price = incomingPrice
      console.log("💰 USING FRONTEND PRICE:", incomingPrice)
    }

    if (!quote.price || quote.price <= 0) {
      console.warn("⚠️ No valid price → fallback = 25")
      quote.price = 25
    }

    /* ================= STATUS ================= */
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    /* ================= TIMELINE ================= */
    quote.timeline = quote.timeline || []
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("✅ APPROVE SUCCESS:", quote.status)

    /* ================= SOCKET ================= */
    try {
      const io = req.app.get("io")
      if (io) io.emit("jobUpdated", quote)
    } catch (err) {
      console.warn("⚠️ Socket failed:", err.message)
    }

    /* ================= EMAIL (SAFE) ================= */
    if (quote.email) {
      sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        quote.toObject()
      ).catch(err => {
        console.warn("⚠️ Email failed:", err.message)
      })
    }

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)

    return res.status(500).json({
      message: err.message || "Approve failed"
    })
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

    return res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

export default router
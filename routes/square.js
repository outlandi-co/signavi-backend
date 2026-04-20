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
    if (!quote) return res.status(404).json({ message: "Quote not found" })
    res.json(quote)
  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ✅ APPROVE (BULLETPROOF)
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  console.log("🚨 APPROVE HIT")
  console.log("📦 BODY:", req.body)

  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    // 🔥 PRICE HANDLING (SAFE)
    let incomingPrice = Number(req.body?.price)

    if (incomingPrice > 0) {
      quote.price = incomingPrice
    }

    // 🔥 HARD FALLBACK (NO CRASH EVER)
    if (!quote.price || quote.price <= 0) {
      console.warn("⚠️ No valid price → forcing 25")
      quote.price = 25
    }

    // ✅ STATUS UPDATE
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    // ✅ TIMELINE
    quote.timeline = quote.timeline || []
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved"
    })

    await quote.save()

    // 🔌 SOCKET SAFE
    try {
      req.app.get("io")?.emit("jobUpdated", quote)
    } catch (e) {
      console.warn("Socket failed:", e.message)
    }

    // 📧 EMAIL SAFE (NON-BLOCKING)
    if (quote.email) {
      sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        quote.toObject()
      ).catch(err => console.warn("Email failed:", err.message))
    }

    return res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ❌ DENY
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

    quote.approvalStatus = "denied"
    quote.denialReason = req.body.reason || ""
    quote.revisionFee = Number(req.body.fee || 0)

    await quote.save()

    try {
      req.app.get("io")?.emit("jobUpdated", quote)
    } catch {}

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
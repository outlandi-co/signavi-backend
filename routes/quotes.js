import express from "express"
import mongoose from "mongoose"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   🔥 CREATE QUOTE
========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      customerName,
      email,
      quantity,
      notes,
      price,
      items,
      artwork,
      printType
    } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email required" })
    }

    const finalPrice = Number(price) > 0 ? Number(price) : 0

    const quote = new Quote({
      customerName: customerName || "Guest",
      email: email.toLowerCase(),
      quantity: Number(quantity) || 1,
      notes: notes || "",

      /* 🔥 CRITICAL */
      price: finalPrice,
      finalPrice: finalPrice,

      items: items || [],
      artwork: artwork || "",
      printType: printType || "screenprint",

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

/* =========================================================
   🔥 GET ALL
========================================================= */
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
   🔥 UPDATE QUOTE (PRICE + NOTE)
========================================================= */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { price, note, status } = req.body

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    /* 🔥 FIX PRICE */
    if (price !== undefined) {
      const newPrice = Number(price)
      quote.price = newPrice
      quote.finalPrice = newPrice   // 🔥 THIS FIXES YOUR UI
    }

    /* STATUS */
    if (status) {
      quote.status = status
    }

    /* TIMELINE */
    if (note || status) {
      quote.timeline.push({
        status: status || quote.status,
        note: note || "",
        date: new Date()
      })
    }

    await quote.save()

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ UPDATE ERROR:", err)
    res.status(500).json({ message: "Update failed" })
  }
})

/* =========================================================
   🔥 APPROVE
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params
    const { price, note } = req.body

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    const finalPrice = Number(price || quote.price || 0)

    if (finalPrice <= 0) {
      return res.status(400).json({
        message: "Set a price before approving"
      })
    }

    /* 🔥 APPLY PRICE */
    quote.price = finalPrice
    quote.finalPrice = finalPrice

    quote.approvalStatus = "approved"
    quote.status = "payment_required"

    quote.timeline.push({
      status: "approved",
      note: note || "Quote approved",
      date: new Date()
    })

    await quote.save()

    /* 🔥 EMAIL */
    await sendOrderStatusEmail(
      quote.email,
      "payment_required",
      quote
    )

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
    const { note } = req.body

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "denied"
    quote.status = "denied"

    quote.timeline.push({
      status: "denied",
      note: note || "Quote denied",
      date: new Date()
    })

    await quote.save()

    await sendOrderStatusEmail(
      quote.email,
      "denied",
      quote
    )

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
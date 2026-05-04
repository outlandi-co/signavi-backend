import express from "express"
import mongoose from "mongoose"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js" // 🔥 ADD THIS
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   CREATE QUOTE
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
      price: finalPrice,
      finalPrice,
      items: items || [],
      artwork: artwork || "",
      printType: printType || "screenprint",
      approvalStatus: "pending",
      status: "quotes",
      source: "quote",
      timeline: [
        { status: "quotes", note: "Quote submitted", date: new Date() }
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
   GET ALL
========================================================= */
router.get("/", async (req, res) => {
  const quotes = await Quote.find().sort({ createdAt: -1 })
  res.json({ success: true, data: quotes })
})

/* =========================================================
   UPDATE
========================================================= */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { price, note } = req.body

    const quote = await Quote.findById(id)

    if (!quote) return res.status(404).json({ message: "Not found" })

    if (price !== undefined) {
      const p = Number(price)
      quote.price = p
      quote.finalPrice = p
    }

    if (note) {
      quote.timeline.push({
        status: quote.status,
        note,
        date: new Date()
      })
    }

    await quote.save()
    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔥 APPROVE → CREATE ORDER
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params
    const { price, note } = req.body

    const quote = await Quote.findById(id)

    if (!quote) return res.status(404).json({ message: "Quote not found" })

    const finalPrice = Number(price || quote.price || 0)

    if (finalPrice <= 0) {
      return res.status(400).json({ message: "Set price first" })
    }

    /* ================= UPDATE QUOTE ================= */
    quote.price = finalPrice
    quote.finalPrice = finalPrice
    quote.approvalStatus = "approved"
    quote.status = "approved"

    quote.timeline.push({
      status: "approved",
      note: note || "Quote approved",
      date: new Date()
    })

    await quote.save()

    /* ================= CREATE ORDER ================= */
    const order = new Order({
      customerName: quote.customerName,
      email: quote.email,
      items: quote.items || [],
      artwork: quote.artwork || "",
      quantity: quote.quantity || 1,
      printType: quote.printType || "screenprint",

      finalPrice,
      subtotal: finalPrice,
      tax: 0,

      source: "quote",
      quoteId: quote._id,
      status: "payment_required",

      timeline: [
        {
          status: "payment_required",
          note: "Order created from approved quote",
          date: new Date()
        }
      ]
    })

    await order.save()

    console.log("🔥 ORDER CREATED:", order._id)

    /* ================= EMAIL ================= */
    try {
      await sendOrderStatusEmail(
        order.email,
        "payment_required",
        order
      )
      console.log("📧 EMAIL SENT")
    } catch (err) {
      console.error("❌ EMAIL ERROR:", err)
    }

    req.app.get("io")?.emit("jobUpdated")

    res.json({
      success: true,
      message: "Quote converted to order",
      order
    })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   DENY
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    quote.approvalStatus = "denied"
    quote.status = "denied"

    quote.timeline.push({
      status: "denied",
      note: req.body.note || "Quote denied",
      date: new Date()
    })

    await quote.save()

    await sendOrderStatusEmail(
      quote.email,
      "denied",
      quote
    )

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
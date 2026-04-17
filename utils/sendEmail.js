import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendQuoteEmail, sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= MULTER ================= */
const uploadPath = path.resolve("uploads")

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true })
}

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  }
})

const upload = multer({ storage })

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json(quote)

  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CREATE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    const data = req.body

    if (!data.email) {
      return res.status(400).json({
        message: "Email is required"
      })
    }

    const cleanEmail = data.email.toLowerCase().trim()

    let parsedPrice = Number(data.price)
    if (!parsedPrice || parsedPrice <= 0) {
      parsedPrice = 50
    }

    const quote = await Quote.create({
      customerName: data.customerName || "Unknown",
      email: cleanEmail,
      quantity: Number(data.quantity) || 1,
      printType: data.printType || "screenprint",
      price: parsedPrice,
      items: data.items || [],
      artwork: req.file ? `/uploads/${req.file.filename}` : null,

      /* 🔥 NEW APPROVAL FLOW */
      approvalStatus: "pending",
      denialReason: "",
      revisionFee: 0
    })

    console.log("💰 QUOTE CREATED:", parsedPrice)
    console.log("📧 EMAIL:", cleanEmail)

    await sendQuoteEmail(cleanEmail, quote).catch(err => {
      console.error("❌ EMAIL ERROR:", err.message)
    })

    req.app.get("io")?.emit("jobCreated", {
      ...quote.toObject(),
      group: "quotes",
      source: "quote",
      type: "quote"
    })

    res.status(201).json(quote)

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= APPROVE ================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "approved"
    quote.denialReason = ""
    quote.revisionFee = 0

    await quote.save()

    /* 📧 SEND APPROVAL EMAIL */
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

/* ================= DENY ================= */
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

    /* 📧 SEND DENIAL EMAIL */
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

/* ================= SEND TO PAYMENT (LOCKED) ================= */
router.patch("/:id/send-to-payment", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    /* 🔥 BLOCK IF NOT APPROVED */
    if (quote.approvalStatus !== "approved") {
      return res.status(400).json({
        message: "Quote must be approved before payment"
      })
    }

    quote.status = "payment_required"

    await quote.save()

    res.json({
      success: true,
      paymentLink: `/checkout/${quote._id}`,
      quote
    })

  } catch (err) {
    console.error("❌ SEND TO PAYMENT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CONVERT TO ORDER ================= */
router.post("/:id/convert", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (quote.approvalStatus !== "approved") {
      return res.status(400).json({
        message: "Quote must be approved first"
      })
    }

    const finalPrice = Number(quote.price)

    const order = await Order.create({
      customerName: quote.customerName,
      email: quote.email,
      quantity: quote.quantity,
      printType: quote.printType,
      artwork: quote.artwork,
      price: finalPrice,
      finalPrice: finalPrice,
      items: quote.items || [],
      status: "production",
      timeline: [{
        status: "production",
        date: new Date(),
        note: "Converted from approved quote"
      }]
    })

    await Quote.findByIdAndDelete(quote._id)

    const io = req.app.get("io")

    io?.emit("jobCreated", {
      ...order.toObject(),
      source: "order",
      type: "order"
    })

    io?.emit("jobDeleted", quote._id)

    res.json(order)

  } catch (err) {
    console.error("❌ CONVERT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
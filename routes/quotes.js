import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendQuoteEmail } from "../utils/sendEmail.js"

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

/* ================= GET ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    res.json(quote)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= CREATE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    const data = req.body

    /* 🔥 SAFE PRICE (NO MORE ZERO TRAPS) */
    let parsedPrice = Number(data.price)

    if (!parsedPrice || parsedPrice <= 0) {
      parsedPrice = 50 // 🔥 DEFAULT TEST PRICE (CHANGE LATER)
    }

    const quote = await Quote.create({
      customerName: data.customerName || "Unknown",
      email: (data.email || "").toLowerCase().trim(),
      quantity: Number(data.quantity) || 1,
      printType: data.printType || "screenprint",

      price: parsedPrice, // 🔥 FIXED

      items: data.items || [],
      artwork: req.file ? `/uploads/${req.file.filename}` : null,
      status: "pending"
    })

    console.log("💰 QUOTE PRICE:", parsedPrice)

    sendQuoteEmail(quote.email, quote).catch(() => {})

    req.app.get("io")?.emit("jobCreated", {
      ...quote.toObject(),
      status: "quotes"
    })

    res.status(201).json(quote)

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SEND TO PAYMENT ================= */
router.patch("/:id/send-to-payment", async (req, res) => {
  try {
    const { price } = req.body

    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    const finalPrice = Number(price || quote.price)

    if (!finalPrice || finalPrice <= 0) {
      return res.status(400).json({
        message: "Price must be set before sending to payment"
      })
    }

    quote.price = finalPrice
    quote.status = "payment_required"

    await quote.save()

    console.log("💳 READY FOR PAYMENT:", finalPrice)

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

/* ================= CONVERT ================= */
router.post("/:id/convert", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    const finalPrice = Number(quote.price)

    if (!finalPrice || finalPrice <= 0) {
      return res.status(400).json({
        message: "Cannot convert quote with $0 price"
      })
    }

    const order = await Order.create({
      customerName: quote.customerName,
      email: (quote.email || "").toLowerCase().trim(),
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
        note: "Converted from quote"
      }]
    })

    await Quote.findByIdAndDelete(quote._id)

    const io = req.app.get("io")
    io?.emit("jobCreated", order)
    io?.emit("jobDeleted", quote._id)

    console.log("🚀 ORDER CREATED:", finalPrice)

    res.json(order)

  } catch (err) {
    console.error("❌ CONVERT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= DENY ================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    await Quote.findByIdAndDelete(quote._id)

    req.app.get("io")?.emit("jobDeleted", quote._id)

    console.log("❌ QUOTE DENIED:", quote._id)

    res.json({ success: true })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
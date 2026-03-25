import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= UPLOAD SETUP ================= */
const uploadPath = path.resolve("uploads")

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath)
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname)
})

const upload = multer({ storage })

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    const quote = await Quote.create({
      customerName: req.body.name || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity) || 1,
      printType: req.body.printType || "custom",
      artwork: req.file?.filename || null,
      status: "pending"
    })

    req.app.get("io").emit("jobUpdated")

    res.json(quote)

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const updated = await Quote.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    )

    if (!updated) {
      return res.status(404).json({ message: "Quote not found" })
    }

    /* 🔥 SEND EMAIL */
    if (updated.email) {
      await sendOrderStatusEmail(
        updated.email,
        updated.status,
        updated._id
      )
    }

    req.app.get("io").emit("jobUpdated")

    res.json(updated)

  } catch (err) {
    console.error("❌ QUOTE STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= UPDATE TRACKING ================= */
router.patch("/:id/tracking", async (req, res) => {
  try {
    const updated = await Quote.findByIdAndUpdate(
      req.params.id,
      { trackingNumber: req.body.trackingNumber },
      { new: true }
    )

    if (!updated) {
      return res.status(404).json({ message: "Quote not found" })
    }

    req.app.get("io").emit("jobUpdated")

    res.json(updated)

  } catch (err) {
    console.error("❌ QUOTE TRACKING ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CONVERT ================= */
/* ================= CONVERT ================= */
router.post("/:id/convert", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    /* 🔥 BUILD ITEMS (FALLBACK OR FROM BODY) */
    const items =
      req.body.items && req.body.items.length > 0
        ? req.body.items
        : [
            {
              name: quote.printType || "Custom Item",
              quantity: quote.quantity || 1,
              price: Number(req.body.price || 0)
            }
          ]

    const order = await Order.create({
      customerName: quote.customerName,
      email: quote.email,

      /* 🔥 CRITICAL FIX */
      items,

      quantity: quote.quantity,
      price: Number(req.body.price || 0),
      finalPrice: Number(req.body.price || 0),

      printType: quote.printType,
      artwork: quote.artwork,

      status: "pending"
    })

    await Quote.findByIdAndDelete(req.params.id)

    req.app.get("io").emit("jobUpdated")

    res.json(order)

  } catch (err) {
    console.error("❌ CONVERT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})
/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  try {
    console.log("🧨 DELETE QUOTE:", req.params.id)

    const deleted = await Quote.findByIdAndDelete(req.params.id)

    if (!deleted) {
      return res.status(404).json({ message: "Quote not found" })
    }

    req.app.get("io").emit("jobUpdated")

    res.json({
      message: "Quote deleted",
      id: req.params.id
    })

  } catch (err) {
    console.error("❌ QUOTE DELETE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
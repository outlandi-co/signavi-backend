import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/emailService.js"

const router = express.Router()

/* ================= PATH SETUP ================= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const uploadPath = path.join(__dirname, "../uploads")

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true })
}

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname)
})

const upload = multer({ storage })

/* ================= CREATE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    const newQuote = await Quote.create({
      customerName: req.body.name || "No Name",
      email: req.body.email || "",
      quantity: Number(req.body.quantity) || 1,
      printType: req.body.printType || "screenprint",
      notes: req.body.notes || "",
      artwork: req.file?.filename || null,
      status: "pending",
      trackingNumber: ""
    })

    req.app.get("io").emit("jobUpdated")

    res.status(201).json(newQuote)

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    console.error("❌ FETCH ERROR:", err)
    res.status(500).json({ error: "Failed to fetch quotes" })
  }
})

/* ================= GET ONE (optional but useful) ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" })
    }

    res.json(quote)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" })
    }

    /* 📧 EMAIL CUSTOMER */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        status,
        `QUOTE-${quote._id.toString().slice(-6)}`
      )
    }

    req.app.get("io").emit("jobUpdated")

    res.json(quote)

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= UPDATE TRACKING ================= */
router.patch("/:id/tracking", async (req, res) => {
  try {
    const { trackingNumber } = req.body

    if (!trackingNumber) {
      return res.status(400).json({ error: "Tracking number required" })
    }

    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      {
        trackingNumber,
        status: "shipping" // 🔥 AUTO MOVE
      },
      { new: true }
    )

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" })
    }

    /* 📧 EMAIL WHEN SHIPPED */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "shipping",
        `QUOTE-${quote._id.toString().slice(-6)}`
      )
    }

    req.app.get("io").emit("jobUpdated")

    res.json(quote)

  } catch (err) {
    console.error("❌ TRACKING ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Quote.findByIdAndDelete(req.params.id)

    if (!deleted) {
      return res.status(404).json({ error: "Quote not found" })
    }

    req.app.get("io").emit("jobUpdated")

    res.json({ message: "Quote deleted" })

  } catch (err) {
    console.error("❌ DELETE ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

console.log("📦 quotes.js LOADED")

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("🔥 REQUEST RECEIVED")

    let imageUrl = null

    if (req.file?.buffer) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "signavi" },
            (error, result) => {
              if (error) return reject(error)
              resolve(result)
            }
          )
          stream.end(req.file.buffer)
        })

        imageUrl = uploadResult.secure_url
        console.log("✅ CLOUDINARY:", imageUrl)

      } catch (err) {
        console.error("❌ CLOUDINARY FAIL:", err.message)
      }
    }

    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl,
      approvalStatus: "pending",

      // 🔥 CRITICAL FIX
      status: "quotes",
      source: "quote"
    })

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= APPROVE ================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

    quote.approvalStatus = "approved"
    quote.status = "payment_required"

    // 🔥 THIS FIXES COLUMN BUG
    quote.source = "order"

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= DENY ================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

    quote.approvalStatus = "denied"
    quote.status = "quotes"
    quote.source = "quote"

    quote.revisionFee = req.body.fee || 0
    quote.denialReason = req.body.reason || ""

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const quotes = await Quote.find().sort({ createdAt: -1 })
  res.json(quotes)
})

router.get("/:id", async (req, res) => {
  const quote = await Quote.findById(req.params.id)
  res.json(quote)
})

export default router
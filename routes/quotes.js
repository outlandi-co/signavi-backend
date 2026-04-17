import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

console.log("📦 quotes.js LOADED")

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("📦 FILE:", req.file)
    console.log("📦 BODY:", req.body)

    let imageUrl = ""

    /* 🔥 CLOUDINARY UPLOAD */
    if (req.file && req.file.buffer) {
      try {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "signavi" },
            (error, result) => {
              if (error) return reject(error)
              resolve(result)
            }
          )

          stream.end(req.file.buffer)
        })

        imageUrl = result.secure_url

        console.log("✅ CLOUDINARY SUCCESS:", imageUrl)

      } catch (err) {
        console.error("❌ CLOUDINARY ERROR:", err.message)
      }
    } else {
      console.warn("⚠️ No file received (multer issue)")
    }

    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl,
      approvalStatus: "pending",
      status: "draft"
    })

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  const quotes = await Quote.find().sort({ createdAt: -1 })
  res.json(quotes)
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  const quote = await Quote.findById(req.params.id)
  res.json(quote)
})

/* ================= APPROVE ================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    console.log("🔥 APPROVE HIT:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Not found" })
    }

    quote.approvalStatus = "approved"
    quote.status = "payment_required"

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= DENY ================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    console.log("🔥 DENY HIT:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Not found" })
    }

    quote.approvalStatus = "denied"
    quote.status = "denied"

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
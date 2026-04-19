import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("🔥 CREATE QUOTE HIT")

    let imageUrl = null
    let lowQuality = false

    /* ================= SAFE FILE CHECK ================= */
    if (req.file && req.file.buffer) {
      console.log("📁 FILE DETECTED:", req.file.originalname)

      if (req.file.size < 100 * 1024) {
        lowQuality = true
        console.warn("⚠️ LOW QUALITY IMAGE")
      }

      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "signavi",
              resource_type: "image"
            },
            (error, result) => {
              if (error) return reject(error)
              resolve(result)
            }
          )

          stream.end(req.file.buffer)
        })

        imageUrl = uploadResult.secure_url

      } catch (uploadErr) {
        console.error("❌ CLOUDINARY ERROR:", uploadErr)
        return res.status(500).json({
          message: "Image upload failed",
          error: uploadErr.message
        })
      }
    } else {
      console.warn("⚠️ NO FILE UPLOADED")
    }

    /* ================= CREATE QUOTE ================= */
    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl,

      approvalStatus: "pending",
      status: "quotes",
      source: "quote",

      lowQuality
    })

    console.log("✅ QUOTE CREATED:", quote._id)

    res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)

    res.status(500).json({
      message: err.message,
      stack: err.stack
    })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

    res.json(quote)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
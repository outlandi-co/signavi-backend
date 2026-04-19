import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("🔥 CREATE QUOTE HIT")

    console.log("📦 BODY:", req.body)
    console.log("📁 FILE:", req.file ? "exists" : "none")

    let imageUrl = null
    let lowQuality = false

    /* ================= FILE UPLOAD ================= */
    if (req.file) {
      try {
        if (!req.file.buffer) {
          throw new Error("File buffer missing")
        }

        console.log("📁 Uploading to Cloudinary...")

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
        console.log("🌩️ CLOUDINARY SUCCESS:", imageUrl)

      } catch (uploadErr) {
        console.error("❌ CLOUDINARY FAILED:", uploadErr.message)
        imageUrl = null // 🔥 DO NOT CRASH
      }
    }

    /* ================= SAFE BODY ================= */
    const customerName = req.body.customerName || "Unknown"
    const email = req.body.email || ""
    const quantity = Number(req.body.quantity || 1)
    const price = Number(req.body.price || 0)
    const notes = req.body.notes || ""

    /* ================= CREATE ================= */
    const quote = await Quote.create({
      customerName,
      email,
      quantity,
      price,
      notes,
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
      error: err.stack
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
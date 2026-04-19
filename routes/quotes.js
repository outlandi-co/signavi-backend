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
    console.log("📁 FILE:", req.file ? req.file.originalname : "none")

    let imageUrl = null
    let lowQuality = false

    /* ================= FILE HANDLING ================= */
    if (req.file && req.file.buffer) {
      console.log("📁 PROCESSING FILE...")

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
        console.log("🌩️ CLOUDINARY SUCCESS:", imageUrl)

      } catch (uploadErr) {
        console.error("❌ CLOUDINARY ERROR:", uploadErr)

        return res.status(500).json({
          message: "Cloudinary upload failed",
          error: uploadErr.message
        })
      }
    }

    /* ================= SAFE PARSE ================= */
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
      lowQuality
    })

    console.log("✅ QUOTE CREATED:", quote._id)

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)

    return res.status(500).json({
      message: err.message,
      stack: err.stack
    })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    console.log("📄 GET ALL QUOTES")

    const quotes = await Quote.find().sort({ createdAt: -1 })

    res.json(quotes)

  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    console.log("📄 GET QUOTE:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      console.warn("⚠️ QUOTE NOT FOUND")
      return res.status(404).json({ message: "Not found" })
    }

    res.json(quote)

  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
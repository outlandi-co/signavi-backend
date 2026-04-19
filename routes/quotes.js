import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

/* =========================================================
   🔥 CREATE QUOTE (FULL SAFE VERSION)
========================================================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("\n🔥 ===== CREATE QUOTE HIT =====")

    console.log("📦 BODY:", req.body)
    console.log("📁 FILE:", req.file ? "exists" : "none")

    let imageUrl = null
    let lowQuality = false

    /* ================= FILE HANDLING ================= */
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
              if (error) {
                console.error("❌ CLOUDINARY ERROR:", error)
                return reject(error)
              }
              resolve(result)
            }
          )

          stream.end(req.file.buffer)
        })

        imageUrl = uploadResult.secure_url
        console.log("🌩️ CLOUDINARY SUCCESS:", imageUrl)

        if (req.file.size < 100 * 1024) {
          lowQuality = true
          console.warn("⚠️ LOW QUALITY IMAGE")
        }

      } catch (uploadErr) {
        console.error("❌ CLOUDINARY FAILED:", uploadErr.message)

        // 🔥 DO NOT CRASH — continue without image
        imageUrl = null
      }
    } else {
      console.warn("⚠️ NO FILE RECEIVED")
    }

    /* ================= SAFE BODY ================= */
    const customerName = req.body.customerName || "Unknown"
    const email = req.body.email || ""
    const quantity = Number(req.body.quantity || 1)
    const price = Number(req.body.price || 0)
    const notes = req.body.notes || ""

    console.log("🧾 PARSED DATA:", {
      customerName,
      email,
      quantity,
      price,
      notes
    })

    /* ================= CREATE DOCUMENT ================= */
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

      lowQuality,

      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Quote created"
        }
      ]
    })

    console.log("✅ QUOTE CREATED:", quote._id)

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR FULL:", err)

    return res.status(500).json({
      message: err.message,
      name: err.name,
      stack: err.stack,
      body: req.body,
      file: req.file ? "exists" : "none"
    })
  }
})

/* =========================================================
   📄 GET ALL QUOTES
========================================================= */
router.get("/", async (req, res) => {
  try {
    console.log("📄 GET ALL QUOTES")

    const quotes = await Quote.find().sort({ createdAt: -1 })

    return res.json(quotes)

  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ONE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    console.log("📄 GET QUOTE:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      console.warn("⚠️ QUOTE NOT FOUND")
      return res.status(404).json({ message: "Not found" })
    }

    return res.json(quote)

  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

export default router
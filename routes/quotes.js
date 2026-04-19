import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("\n🔥 ===== CREATE QUOTE START =====")

    console.log("📦 BODY:", req.body)
    console.log("📁 FILE:", req.file)

    let imageUrl = null

    /* ================= FILE HANDLING ================= */
    if (req.file) {

      if (!req.file.buffer) {
        console.error("❌ FILE HAS NO BUFFER")
        return res.status(500).json({
          message: "File buffer missing",
          file: req.file
        })
      }

      console.log("📁 Uploading to Cloudinary...")

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

        console.log("🌩️ CLOUDINARY SUCCESS:", imageUrl)

      } catch (err) {
        console.error("❌ CLOUDINARY FAILED:", err)

        return res.status(500).json({
          message: "Cloudinary failed",
          error: err.message
        })
      }
    } else {
      console.warn("⚠️ NO FILE PROVIDED")
    }

    /* ================= CREATE ================= */
    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl,

      approvalStatus: "pending",
      status: "quotes",
      source: "quote"
    })

    console.log("✅ QUOTE CREATED:", quote._id)

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ FINAL ERROR:", err)

    return res.status(500).json({
      message: err.message,
      stack: err.stack
    })
  }
})

export default router
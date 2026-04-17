import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()


console.log("📦 quotes.js LOADED")
/* ================= TEST ================= */
router.post("/test", (req, res) => {
  console.log("🔥 TEST ROUTE HIT")
  res.json({ message: "POST WORKS" })
})

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("📦 FILE:", req.file)
    console.log("📦 BODY:", req.body)

    let imageUrl = ""

    /* ================= SAFE FILE CHECK ================= */
    if (req.file && req.file.buffer) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "signavi" },
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
        console.log("✅ Cloudinary uploaded:", imageUrl)

      } catch (cloudErr) {
        console.error("❌ CLOUDINARY FAIL:", cloudErr.message)
        return res.status(500).json({
          message: "Cloudinary upload failed",
          error: cloudErr.message
        })
      }
    } else {
      console.warn("⚠️ No file received")
    }

    /* ================= CREATE QUOTE ================= */
    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl
    })

    console.log("✅ Quote saved:", quote._id)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({
      message: "Server error",
      error: err.message
    })
  }
})
/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json(quote)
  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

export default router
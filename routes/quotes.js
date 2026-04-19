import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   🔥 CREATE QUOTE
========================================================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("\n🔥 ===== CREATE QUOTE START =====")

    console.log("📦 BODY:", req.body)
    console.log("📁 FILE:", req.file ? "exists" : "none")

    let imageUrl = null
    let lowQuality = false

    /* ================= FILE HANDLING ================= */
    if (req.file) {

      if (!req.file.buffer) {
        console.error("❌ FILE HAS NO BUFFER")

        return res.status(400).json({
          message: "Invalid file upload"
        })
      }

      /* 🔥 LOW QUALITY FLAG */
      if (req.file.size < 100 * 1024) {
        lowQuality = true
        console.warn("⚠️ LOW QUALITY IMAGE DETECTED")
      }

      console.log("📁 Uploading to Cloudinary...")

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
        console.error("❌ CLOUDINARY FAILED:", uploadErr)

        return res.status(500).json({
          message: "Image upload failed",
          error: uploadErr.message
        })
      }
    } else {
      console.warn("⚠️ NO FILE PROVIDED (continuing without artwork)")
    }

    /* ================= SAFE BODY PARSE ================= */
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

      lowQuality,
      timeline: [
        {
          status: "quotes",
          date: new Date(),
          note: "Quote created"
        }
      ]
    })

    console.log("✅ QUOTE CREATED:", quote._id)

    /* ================= SOCKET ================= */
    req.app.get("io")?.emit("jobCreated", quote)

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

    return res.status(500).json({
      message: err.message
    })
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

    return res.status(500).json({
      message: err.message
    })
  }
})

/* =========================================================
   ✅ APPROVE QUOTE
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "approved"

    await quote.save()

    console.log("✅ QUOTE APPROVED:", quote._id)

    /* 🔥 EMAIL */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        {
          ...quote.toObject(),
          paymentUrl: `${process.env.CLIENT_URL}/quote/${quote._id}`
        }
      )
    }

    /* 🔥 SOCKET */
    req.app.get("io")?.emit("jobUpdated", quote)

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

/* =========================================================
   ❌ DENY QUOTE
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    quote.approvalStatus = "denied"
    quote.denialReason = req.body.reason || ""
    quote.revisionFee = Number(req.body.fee || 0)

    await quote.save()

    console.log("❌ QUOTE DENIED:", quote._id)

    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "denied",
        quote._id,
        quote
      )
    }

    req.app.get("io")?.emit("jobUpdated", quote)

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

export default router
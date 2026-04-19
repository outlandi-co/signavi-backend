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

    let imageUrl = null

    if (req.file?.buffer) {
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
    }

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

    req.app.get("io")?.emit("jobCreated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ALL QUOTES
========================================================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ONE QUOTE (🔥 THIS FIXES YOUR ERROR)
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    console.log("📄 GET QUOTE:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json(quote)

  } catch (err) {
    console.error("❌ GET ONE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ✅ APPROVE
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

    quote.approvalStatus = "approved"
    await quote.save()

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

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ❌ DENY
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

    quote.approvalStatus = "denied"
    quote.denialReason = req.body.reason || ""
    quote.revisionFee = Number(req.body.fee || 0)

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
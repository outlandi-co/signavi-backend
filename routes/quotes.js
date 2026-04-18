import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    let imageUrl = null
    let lowQuality = false

    if (req.file?.buffer) {
      // 🔥 SIMPLE QUALITY CHECK (file size proxy)
      if (req.file.size < 100 * 1024) {
        lowQuality = true
        console.warn("⚠️ LOW QUALITY IMAGE DETECTED")
      }

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
    }

    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl,

      // 🔥 IMPORTANT
      approvalStatus: "pending",
      status: "quotes",
      source: "quote",

      // 🔥 NEW
      lowQuality
    })

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error(err)
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
    quote.source = "order"

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })
  } catch (err) {
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
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

console.log("📦 quotes.js LOADED")

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("🔥 REQUEST RECEIVED")

    console.log("🧪 FILE CHECK:", {
      exists: !!req.file,
      hasBuffer: !!req.file?.buffer,
      size: req.file?.size
    })

    console.log("📦 BODY:", req.body)

    let imageUrl = ""

    /* ================= CLOUDINARY UPLOAD ================= */
    if (req.file && req.file.buffer) {
      console.log("🔥 ENTERING CLOUDINARY BLOCK")

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

        console.log("✅ CLOUDINARY SUCCESS:", imageUrl)

      } catch (err) {
        console.error("❌ CLOUDINARY FAIL:", err.message)
      }

    } else {
      console.warn("⚠️ NO VALID FILE BUFFER — upload skipped")
    }

    /* ================= SAVE QUOTE ================= */
    const quote = await Quote.create({
      customerName: req.body.customerName || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity || 1),
      price: Number(req.body.price || 0),
      notes: req.body.notes || "",
      artwork: imageUrl || null, // ✅ NEVER empty string
      approvalStatus: "pending",
      status: "draft"
    })

    console.log("✅ QUOTE SAVED:", quote._id)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    console.error("❌ GET ALL ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })
    res.json(quote)
  } catch (err) {
    console.error("❌ GET ONE ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* ================= APPROVE ================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    console.log("🔥 APPROVE HIT:", req.params.id)

    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })

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
    if (!quote) return res.status(404).json({ message: "Not found" })

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
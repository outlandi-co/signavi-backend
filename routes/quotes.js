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
      source: "quote",
      timeline: [
        {
          status: "quotes",
          date: new Date(),
          note: "Quote created"
        }
      ]
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
   📄 GET ALL
========================================================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    console.error("❌ GET ALL ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET ONE (🔥 FIXES YOUR 404)
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    console.log("📄 GET QUOTE:", req.params.id)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      console.warn("❌ NOT FOUND:", req.params.id)
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
    quote.status = "payment_required"
    quote.source = "order"

    /* 🔥 SAFE PAYMENT LINK (NO CRASHES) */
    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    let paymentUrl = `${CLIENT_URL}/checkout/${quote._id}`

    /* 🔥 TRY REAL SQUARE LINK (OPTIONAL) */
    try {
      const baseUrl =
        process.env.BASE_URL || "https://signavi-backend.onrender.com"

      const payRes = await fetch(
        `${baseUrl}/api/square/create-payment/${quote._id}`,
        { method: "POST" }
      )

      if (payRes.ok) {
        const payJson = await payRes.json()
        if (payJson?.url) {
          paymentUrl = payJson.url
        }
      } else {
        console.warn("⚠️ Square route failed, using fallback link")
      }

    } catch (err) {
      console.warn("⚠️ Square error, fallback used:", err.message)
    }

    quote.paymentUrl = paymentUrl

    /* 🔥 TIMELINE */
    quote.timeline = quote.timeline || []
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("✅ APPROVED:", quote._id)

    /* 🔔 REALTIME */
    req.app.get("io")?.emit("jobUpdated", quote)

    /* 📧 EMAIL */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        { ...quote.toObject(), paymentUrl }
      )
    }

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
    quote.status = "quotes"
    quote.source = "quote"
    quote.denialReason = req.body.reason || ""
    quote.revisionFee = Number(req.body.fee || 0)

    quote.timeline = quote.timeline || []
    quote.timeline.push({
      status: "denied",
      date: new Date(),
      note: "Artwork denied"
    })

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
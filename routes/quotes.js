import express from "express"
import multer from "multer"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= MULTER ================= */
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }
})

/* =========================================================
   🆕 CREATE QUOTE
========================================================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  console.log("🔥 CREATE QUOTE HIT")
  console.log("📦 BODY:", req.body)
  console.log("📁 FILE:", req.file)

  try {
    let {
      customerName,
      email,
      quantity,
      printType,
      price,
      items,
      notes
    } = req.body || {}

    /* ================= SAFE DEFAULTS ================= */
    customerName = customerName || "New Customer"
    email = email || ""
    quantity = Number(quantity || 1)
    printType = printType || "unknown"
    price = Number(price || 25)

    /* ================= FIX ITEMS ================= */
    if (typeof items === "string") {
      try {
        items = JSON.parse(items)
      } catch (err) {
        console.warn("⚠️ ITEMS PARSE FAILED:", err.message)
        items = []
      }
    }

    if (!Array.isArray(items)) items = []

    items = items.map(item => ({
      name: item?.name || printType,
      quantity: Number(item?.quantity || 1),
      price: Number(item?.price || 0)
    }))

    /* ================= FILE ================= */
    const artworkPath = req.file
      ? `/uploads/${req.file.filename}`
      : ""

    /* ================= BUILD ================= */
    const quote = new Quote({
      customerName,
      email,
      quantity,
      price,
      items,
      notes,
      artwork: artworkPath,
      status: "pending",
      approvalStatus: "pending",
      source: "quote",
      timeline: [
        {
          status: "pending",
          date: new Date(),
          note: "Quote created"
        }
      ]
    })

    /* ================= SAVE ================= */
    console.log("🔥 SAVING QUOTE NOW...")
    await quote.save()
    console.log("✅ QUOTE SAVED:", quote._id)

    return res.status(201).json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR FULL:", err)
    return res.status(500).json({
      message: err.message
    })
  }
})

/* =========================================================
   📄 GET SINGLE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("📡 GET QUOTE:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      console.warn("⚠️ QUOTE NOT FOUND:", id)
      return res.status(404).json({
        message: "Quote not found"
      })
    }

    console.log("✅ QUOTE FOUND:", quote._id)

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    return res.status(500).json({
      message: err.message
    })
  }
})

/* =========================================================
   ✅ APPROVE QUOTE (🔥 FIXES YOUR ERROR)
========================================================= */
router.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params

    console.log("✅ APPROVE QUOTE:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({
        message: "Quote not found"
      })
    }

    /* 🔥 UPDATE STATUS */
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    /* 🔥 TIMELINE UPDATE */
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("🔥 QUOTE APPROVED:", quote._id)

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

export default router
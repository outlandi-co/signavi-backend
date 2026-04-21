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

    /* 🔥 DEBUG OBJECT BEFORE SAVE */
    console.log("🧪 FINAL QUOTE OBJECT:", JSON.stringify(quote, null, 2))

    /* ================= TEMP SAVE TEST ================= */
    // 👉 COMMENT THIS OUT FIRST RUN
    // await quote.save()

    /* ================= RETURN DEBUG ================= */
    return res.status(200).json({
      success: true,
      debug: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR FULL:", err)
    console.error("STACK:", err.stack)

    return res.status(500).json({
      message: err.message,
      stack: err.stack
    })
  }
})

export default router
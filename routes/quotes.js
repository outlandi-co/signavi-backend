import express from "express"
import multer from "multer"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js" // ✅ ADD THIS

const router = express.Router()

console.log("🚀 QUOTES ROUTE LOADED (EMAIL ENABLED)")

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

    customerName = customerName || "New Customer"
    email = email || ""
    quantity = Number(quantity || 1)
    printType = printType || "unknown"
    price = Number(price || 25)

    if (typeof items === "string") {
      try {
        items = JSON.parse(items)
      } catch {
        items = []
      }
    }

    if (!Array.isArray(items)) items = []

    items = items.map(item => ({
      name: item?.name || printType,
      quantity: Number(item?.quantity || 1),
      price: Number(item?.price || 0)
    }))

    const artworkPath = req.file
      ? `/uploads/${req.file.filename}`
      : ""

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

    console.log("🔥 SAVING QUOTE...")
    await quote.save()
    console.log("✅ QUOTE SAVED:", quote._id)

    return res.status(201).json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
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
    console.error("❌ GET ERROR:", err)
    return res.status(500).json({
      message: err.message
    })
  }
})

/* =========================================================
   ✅ APPROVE HANDLER (NOW WITH EMAIL)
========================================================= */
async function approveHandler(req, res) {
  try {
    const { id } = req.params

    console.log("🔥 APPROVE ROUTE HIT:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({
        message: "Quote not found"
      })
    }

    /* ================= UPDATE ================= */
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    /* ================= TIMELINE ================= */
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("🔥 QUOTE APPROVED:", quote._id)

    /* ================= 📧 SEND EMAIL ================= */
    if (quote.email) {
      console.log("📧 SENDING EMAIL TO:", quote.email)

      await sendOrderStatusEmail(
        quote.email,
        "payment_required",
        quote._id,
        quote
      )
    } else {
      console.warn("⚠️ NO EMAIL FOUND ON QUOTE")
    }

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
}

/* =========================================================
   🔥 ROUTES
========================================================= */
router.patch("/:id/approve", approveHandler)
router.post("/:id/approve", approveHandler)

export default router
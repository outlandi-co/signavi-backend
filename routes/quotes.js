import express from "express"
import Quote from "../models/Quote.js"
import upload from "../middleware/upload.js"

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
    console.log("🔥 HEADERS:", req.headers)
    console.log("🔥 CONTENT TYPE:", req.headers["content-type"])

    console.log("📦 FILE:", req.file)
    console.log("📦 BODY:", req.body)

    // 🔥 TEMP (no cloudinary yet)
    const imageUrl = req.file
      ? `LOCAL_FILE_${req.file.originalname}`
      : ""

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
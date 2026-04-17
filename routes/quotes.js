import express from "express"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import upload from "../middleware/upload.js"

const router = express.Router()

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("📦 FILE:", req.file)

    const quote = await Quote.create({
      customerName: req.body.customerName,
      email: req.body.email,
      quantity: req.body.quantity,
      price: req.body.price,
      notes: req.body.notes,

      // 🔥 CLOUDINARY URL
      artwork: req.file?.path || ""
    })

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })
    res.json(quotes)
  } catch (err) {
    res.status(500).json({ message: "Server error" })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })
    res.json(quote)
  } catch {
    res.status(500).json({ message: "Server error" })
  }
})

/* ================= TEST ================= */

router.post("/test", (req, res) => {
  console.log("🔥 TEST ROUTE HIT")
  res.json({ message: "POST WORKS" })
})

export default router
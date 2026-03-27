import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= MULTER SETUP ================= */
const uploadPath = path.resolve("uploads")

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true })
}

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  }
})

const upload = multer({ storage })

/* ================= CREATE QUOTE (🔥 THIS IS MISSING) ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    console.log("🧾 CREATE QUOTE HIT")
    console.log("📁 FILE:", req.file)
    console.log("📦 BODY:", req.body)

    const newQuote = await Quote.create({
      customerName: req.body.customerName,
      email: req.body.email,
      quantity: req.body.quantity,
      printType: req.body.printType,
      notes: req.body.notes,

      artwork: req.file ? req.file.filename : null,

      status: "pending",
      timeline: [{ status: "pending", date: new Date() }]
    })

    res.status(201).json(newQuote)

  } catch (err) {
    console.error("❌ QUOTE CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= UPLOAD SETUP ================= */

const uploadPath = path.resolve("uploads")

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath)
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  }
})

const upload = multer({ storage })

/* ================= CREATE QUOTE ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    /* 🔥 CORRECT DEBUG LOCATION */
    console.log("✅ BODY AFTER MULTER:", req.body)
    console.log("✅ FILE AFTER MULTER:", req.file)

    const quote = await Quote.create({
      customerName: req.body.name || "Unknown",
      email: req.body.email || "",
      quantity: Number(req.body.quantity) || 1,
      printType: req.body.printType || "custom",
      artwork: req.file ? req.file.filename : null,
      status: "pending"
    })

    res.json(quote)
  } catch (err) {
    console.error("🔥 CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Not found" })
    res.json(quote)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
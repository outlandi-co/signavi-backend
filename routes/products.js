import express from "express"
import multer from "multer"
import Product from "../models/Product.js"

const router = express.Router()

/* 🔥 MULTER SETUP */
const upload = multer()

router.post("/", upload.none(), async (req, res) => {
  try {

    console.log("📦 RAW BODY:", req.body)

    if (!req.body) {
      return res.status(400).json({ message: "No form data received" })
    }

    const {
      name,
      description,
      category,
      price,
      stock
    } = req.body

    if (!name) {
      return res.status(400).json({ message: "Name required" })
    }

    /* 🔥 PARSE STRINGIFIED DATA */
    const sizes = JSON.parse(req.body.sizes || "[]")
    const variants = JSON.parse(req.body.variants || "[]")
    const colors = JSON.parse(req.body.colors || "[]")

    console.log("🔥 PARSED SIZES:", sizes)
    console.log("🔥 PARSED VARIANTS:", variants)

    const product = await Product.create({
      name,
      description,
      category,
      price: Number(price),
      stock: Number(stock),
      sizes,
      variants,
      colors
    })

    res.json(product)

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({
      message: "Create failed",
      error: err.message
    })
  }
})

export default router
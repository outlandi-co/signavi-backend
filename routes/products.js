import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import Product from "../models/Product.js"

const router = express.Router()

/* ================= ENSURE UPLOADS DIR ================= */
const uploadDir = "uploads"
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir)
}

/* ================= MULTER STORAGE ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB per file
})

/* ================= HELPERS ================= */
const safeParse = (data, fallback = []) => {
  try {
    return JSON.parse(data || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

const normalizeSize = (s) => {
  if (!s) return null
  const map = {
    SMALL: "S", S: "S",
    MEDIUM: "M", M: "M",
    LARGE: "L", L: "L",
    "X-LARGE": "XL", XL: "XL"
  }
  return map[String(s).toUpperCase()] || null
}

/* ================= CREATE PRODUCT ================= */
router.post("/", upload.array("images", 20), async (req, res) => {
  try {
    const { name, description, category, price, stock } = req.body

    if (!name) {
      return res.status(400).json({ message: "Name required" })
    }

    const rawVariants = safeParse(req.body.variants)
    const rawSizes = safeParse(req.body.sizes)
    const colors = safeParse(req.body.colors)

    const sizes = rawSizes.map(normalizeSize).filter(Boolean)

    const files = req.files || []
    const colorInputs = req.body.imageColors || []

    console.log("📸 FILES RECEIVED:", files.length)

    /* ================= MAP IMAGES BY COLOR ================= */
    const colorMap = {}

    files.forEach((file, i) => {
      const color = Array.isArray(colorInputs)
        ? colorInputs[i]
        : colorInputs

      if (!colorMap[color]) colorMap[color] = []

      colorMap[color].push(`/uploads/${file.filename}`)
    })

    /* ================= BUILD VARIANTS ================= */
    const variants = rawVariants.map(v => ({
      color: v.color,
      size: normalizeSize(v.size),
      stock: Number(v.stock) || 0,
      price: Number(v.price) || 0,
      images: colorMap[v.color] || []
    })).filter(v => v.color && v.size)

    const product = await Product.create({
      name,
      description,
      category,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      sizes,
      variants,
      colors,
      active: true
    })

    console.log("✅ PRODUCT CREATED:", product.name)

    res.json(product)

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: "Create failed", error: err.message })
  }
})

/* ================= GET PRODUCTS ================= */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 })
    res.json(products)
  } catch (err) {
    res.status(500).json({ message: "Fetch failed" })
  }
})

export default router
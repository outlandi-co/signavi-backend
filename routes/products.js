import express from "express"
import multer from "multer"
import Product from "../models/Product.js"

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
})

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
    XL: "XL", "EXTRA-LARGE": "XL",
    XXL: "2XL", "2XL": "2XL"
  }
  return map[String(s).toUpperCase()] || null
}

/* ================= CREATE PRODUCT ================= */
router.post("/", upload.array("images", 20), async (req, res) => {
  try {
    const { name, description, category, price, stock } = req.body

    const rawVariants = safeParse(req.body.variants)
    const rawSizes = safeParse(req.body.sizes)
    const colors = safeParse(req.body.colors)

    const sizes = rawSizes.map(normalizeSize).filter(Boolean)

    const files = req.files || []
    const colorInputs = req.body.imageColors || []

    const colorMap = {}

    files.forEach((file, i) => {
      const color = Array.isArray(colorInputs)
        ? colorInputs[i]
        : colorInputs

      if (!colorMap[color]) colorMap[color] = []

      colorMap[color].push(
        `data:${file.mimetype};base64,${file.buffer.toString("base64")}`
      )
    })

    const cleanVariants = rawVariants.map(v => ({
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
      price: Number(price),
      stock: Number(stock),
      sizes,
      variants: cleanVariants,
      colors,
      active: true
    })

    res.json(product)

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Create failed" })
  }
})

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 })
  res.json(products)
})

export default router
import express from "express"
import multer from "multer"
import Product from "../models/Product.js"

const router = express.Router()

/* ================= MULTER ================= */
const upload = multer({ storage: multer.memoryStorage() })

/* ================= SAFE PARSER ================= */
const safeParse = (data, fallback = []) => {
  try {
    return JSON.parse(data || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

/* ================= SIZE NORMALIZER ================= */
const normalizeSize = (s) => {
  if (!s) return null

  const map = {
    XS: "XS",

    SMALL: "S",
    S: "S",

    MEDIUM: "M",
    M: "M",

    LARGE: "L",
    L: "L",

    XL: "XL",
    "EXTRA-LARGE": "XL",
    "X-LARGE": "XL",

    XXL: "2XL",
    "2XL": "2XL",

    "3XL": "3XL",
    "4XL": "4XL"
  }

  return map[String(s).toUpperCase()] || null
}

/* ================= CREATE PRODUCT ================= */
router.post("/", upload.any(), async (req, res) => {
  try {
    console.log("📦 RAW BODY:", req.body)

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No form data received" })
    }

    const { name, description, category, price, stock } = req.body

    if (!name) {
      return res.status(400).json({ message: "Name required" })
    }

    /* 🔥 PARSE ARRAYS */
    const rawSizes = safeParse(req.body.sizes)
    const rawVariants = safeParse(req.body.variants)
    const colors = safeParse(req.body.colors)

    /* 🔥 NORMALIZE SIZES */
    const sizes = (rawSizes || [])
      .map(normalizeSize)
      .filter(Boolean)

    /* 🔥 CLEAN VARIANTS */
    const cleanVariants = (rawVariants || [])
      .map(v => {
        const normalizedSize = normalizeSize(v.size)

        return {
          color: v.color || "",
          size: normalizedSize,
          stock: Number(v.stock) || 0,
          price: Number(v.price) || 0,
          images: Array.isArray(v.images)
            ? v.images.filter(img => typeof img === "string" && img.length > 0)
            : []
        }
      })
      .filter(v => v.color && v.size) // remove invalid variants

    console.log("🔥 FINAL SIZES:", sizes)
    console.log("🔥 FINAL VARIANTS:", cleanVariants)

    const product = await Product.create({
      name,
      description,
      category,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      sizes,
      variants: cleanVariants,
      colors,
      active: true
    })

    console.log("✅ PRODUCT CREATED:", product.name)

    res.json(product)

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)

    res.status(500).json({
      message: "Create failed",
      error: err.message
    })
  }
})

/* ================= GET ALL PRODUCTS ================= */
router.get("/", async (req, res) => {
  try {
    console.log("🔥 HIT /api/products")

    const products = await Product.find().sort({ createdAt: -1 })

    console.log("📦 PRODUCTS FETCHED:", products.length)

    res.json(products)

  } catch (err) {
    console.error("❌ GET PRODUCTS ERROR:", err)

    res.status(500).json({
      message: "Failed to fetch products"
    })
  }
})

export default router
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

/* ================= CREATE PRODUCT ================= */
router.post("/", upload.any(), async (req, res) => {
  try {
    console.log("📦 RAW BODY:", req.body)
    console.log("📸 FILES:", req.files)

    if (!req.body || Object.keys(req.body).length === 0) {
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

    /* 🔥 PARSE ARRAYS FROM FORMDATA */
    const sizes = safeParse(req.body.sizes)
    const variants = safeParse(req.body.variants)
    const colors = safeParse(req.body.colors)

    console.log("🔥 CLEAN SIZES:", sizes)
    console.log("🔥 CLEAN VARIANTS:", variants)

    const product = await Product.create({
      name,
      description,
      category,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      sizes,
      variants,
      colors
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

    const products = await Product.find({ active: true })
      .sort({ createdAt: -1 })

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
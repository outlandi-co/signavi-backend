import express from "express"
import Product from "../models/Product.js"
import multer from "multer"
import path from "path"
import fs from "fs"

const router = express.Router()

/* ================= UPLOAD SETUP ================= */
const uploadDir = path.resolve("uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-")
    cb(null, Date.now() + "-" + safeName)
  }
})

const upload = multer({ storage })

/* ================= SAFE PARSER ================= */
const safeParse = (val, fallback = []) => {
  try {
    return typeof val === "string" ? JSON.parse(val) : val || fallback
  } catch {
    return fallback
  }
}

/* ================= GET ================= */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 })
    res.json(products)
  } catch (err) {
    console.error("❌ GET PRODUCTS ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= CREATE ================= */
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      description,
      image,
      category,
      price,
      stock,
      sizes,
      colors,
      variants
    } = req.body

    if (!name) {
      return res.status(400).json({ error: "Product name required" })
    }

    const cleanVariants = Array.isArray(variants)
      ? variants.map(v => ({
          color: v.color,
          size: v.size,
          stock: Number(v.stock) || 0,
          price: Number(v.price) || 0,
          images: Array.isArray(v.images) ? v.images : []
        }))
      : []

    let imagePath = ""
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`
    } else if (image) {
      imagePath = image
    }

    const product = await Product.create({
      name: name.trim(),
      description: description || "",
      category: (category || "general").toLowerCase(),
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      sizes: Array.isArray(sizes) ? sizes : [],
      colors: Array.isArray(colors) ? colors : [],
      variants: cleanVariants,
      image: imagePath
    })

    res.status(201).json(product)

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= UPDATE ================= */
router.put("/:id", upload.single("image"), async (req, res) => {
  try {

    /* 🔥 KEEP EXISTING VARIANTS */
    const parsedVariants = safeParse(req.body.variants, [])

    const variants = parsedVariants.map(v => ({
      color: v.color,
      size: v.size,
      stock: Number(v.stock) || 0,
      price: Number(v.price) || 0,
      images: Array.isArray(v.images) ? v.images : []
    }))

    const updateData = {
      name: req.body.name?.trim(),
      description: req.body.description || "",
      category: (req.body.category || "general").toLowerCase().trim(),
      price: Number(req.body.price) || 0,
      stock: Number(req.body.stock) || 0,
      variants,
      active: req.body.active !== "false"
    }

    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )

    res.json(updated)

  } catch (err) {
    console.error("💥 UPDATE ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id)
    res.json({ message: "Deleted" })
  } catch (err) {
    console.error("❌ DELETE ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
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
    return val ? JSON.parse(val) : fallback
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

    const sizes = safeParse(req.body.sizes)

    const colors = safeParse(req.body.colors).map(c =>
      typeof c === "string" ? { name: c } : c
    )

    const product = await Product.create({
      name: req.body.name,
      description: req.body.description || "",
      category: (req.body.category || "general").toLowerCase(),

      brand: req.body.brand || "Bella Canvas",
      styleCode: req.body.styleCode || "",

      cost: Number(req.body.cost) || 0,
      price: Number(req.body.price) || Number(req.body.cost) || 0,
      stock: Number(req.body.stock) || 0,

      sizes,
      colors,

      image: req.file
        ? `/uploads/${req.file.filename}`
        : "",

      active: req.body.active !== "false"
    })

    res.status(201).json(product)

  } catch (err) {
    console.error("💥 CREATE PRODUCT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= UPDATE ================= */
router.put("/:id", upload.single("image"), async (req, res) => {
  try {

    const sizes = safeParse(req.body.sizes)

    const colors = safeParse(req.body.colors).map(c =>
      typeof c === "string" ? { name: c } : c
    )

    const updateData = {
      ...req.body,

      price: Number(req.body.price) || 0,
      cost: Number(req.body.cost) || 0,
      stock: Number(req.body.stock) || 0,

      sizes,
      colors,

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
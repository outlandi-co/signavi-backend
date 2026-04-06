import express from "express"
import Product from "../models/Product.js"
import { requireAuth } from "../middleware/requireAuth.js"

const router = express.Router()

/* ---------------- GET ALL PRODUCTS ---------------- */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 })
    res.json(products)
  } catch (err) {
    console.error("GET PRODUCTS ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ---------------- CREATE PRODUCT ---------------- */
router.post("/", async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "No product data provided" })
    }

    const product = new Product({
      name: req.body.name,
      vendor: req.body.vendor,
      sku: req.body.sku,
      description: req.body.description,
      price: Number(req.body.price) || 0,

      // 🔥 SUPPORT BOTH cost + baseCost
      cost: Number(req.body.cost || req.body.baseCost) || 0,

      category: req.body.category,

      // 🔥 STOCK FIX (important)
      stock: Number(req.body.stock || req.body.quantity) || 0,

      image: req.body.image
    })

    await product.save()

    res.status(201).json(product)

  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ---------------- UPDATE PRODUCT ---------------- */
router.put("/:id", async (req, res) => {
  try {
    const updateData = {}

    // 🔥 Only update fields that exist (prevents overwriting)
    if (req.body.name !== undefined) updateData.name = req.body.name
    if (req.body.vendor !== undefined) updateData.vendor = req.body.vendor
    if (req.body.sku !== undefined) updateData.sku = req.body.sku
    if (req.body.description !== undefined) updateData.description = req.body.description

    if (req.body.price !== undefined) {
      updateData.price = Number(req.body.price)
    }

    // 🔥 HANDLE COST SAFELY
    if (req.body.cost !== undefined || req.body.baseCost !== undefined) {
      updateData.cost = Number(req.body.cost || req.body.baseCost)
    }

    // 🔥 HANDLE STOCK SAFELY
    if (req.body.stock !== undefined || req.body.quantity !== undefined) {
      updateData.stock = Number(req.body.stock || req.body.quantity)
    }

    if (req.body.category !== undefined) updateData.category = req.body.category
    if (req.body.image !== undefined) updateData.image = req.body.image

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json(product)

  } catch (err) {
    console.error("UPDATE PRODUCT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ---------------- DELETE PRODUCT ---------------- */
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id)

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json({ message: "Product deleted successfully" })

  } catch (err) {
    console.error("DELETE PRODUCT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
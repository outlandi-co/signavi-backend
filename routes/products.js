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

/* ---------------- CREATE PRODUCT (NO AUTH FOR NOW) ---------------- */

router.post("/", async (req, res) => {
  try {
    console.log("Incoming product:", req.body)

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "No product data provided" })
    }

    const product = new Product(req.body)

    await product.save()

    res.status(201).json(product)

  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ---------------- UPDATE PRODUCT (KEEP AUTH) ---------------- */

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
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

/* ---------------- DELETE PRODUCT (KEEP AUTH) ---------------- */

router.delete("/:id", requireAuth, async (req, res) => {
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
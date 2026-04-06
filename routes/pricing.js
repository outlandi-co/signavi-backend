import express from "express"
import Pricing from "../models/Pricing.js"

const router = express.Router()

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const pricing = await Pricing.find()
  res.json(pricing)
})

/* ================= UPDATE ================= */
router.put("/:category", async (req, res) => {
  try {
    const category = req.params.category?.toLowerCase().trim()

    let { profitMultiplier, setupFee } = req.body

    profitMultiplier = Number(profitMultiplier) || 0.6
    setupFee = Number(setupFee) || 0

    const pricing = await Pricing.findOneAndUpdate(
      { category },
      { profitMultiplier, setupFee },
      { new: true, upsert: true }
    )

    // 🔥 EMIT REAL-TIME EVENT
    const io = req.app.get("io")
    io.emit("pricingUpdated", { category })

    res.json(pricing)

  } catch (err) {
    console.error("❌ PRICING UPDATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= 🔥 THIS IS THE MISSING PIECE ================= */
router.post("/calculate", async (req, res) => {
  try {
    let { baseCost, quantity, category } = req.body

    category = category?.toLowerCase().trim()
    baseCost = Number(baseCost)
    quantity = Number(quantity)

    if (!category) {
      return res.status(400).json({ message: "Category required" })
    }

    if (!baseCost || baseCost <= 0) {
      return res.status(400).json({ message: "Invalid baseCost" })
    }

    if (!quantity || quantity <= 0) {
      quantity = 1
    }

    let config = await Pricing.findOne({ category })

    if (!config) {
      config = {
        profitMultiplier: 0.6,
        setupFee: 0
      }
    }

    const multiplier = Number(config.profitMultiplier)
    const setup = Number(config.setupFee)

    const profit = baseCost * multiplier
    const unit = baseCost + profit

    let discount = 0
    if (quantity >= 50) discount = 0.2
    else if (quantity >= 20) discount = 0.1
    else if (quantity >= 10) discount = 0.05

    const finalUnit = unit * (1 - discount)
    const total = (finalUnit * quantity) + setup

    res.json({
      unit: Number(finalUnit.toFixed(2)),
      total: Number(total.toFixed(2)),
      breakdown: {
        baseCost,
        profit,
        setup,
        discount,
        quantity,
        category
      }
    })

  } catch (err) {
    console.error("❌ CALCULATE ERROR:", err)
    res.status(500).json({ message: "Calculation failed" })
  }
})

export default router
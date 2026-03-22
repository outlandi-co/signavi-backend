import express from "express"

const router = express.Router()

/* ================= AI PRICING ================= */
router.post("/", (req, res) => {
  try {
    let { quantity, printType, colors } = req.body

    quantity = Number(quantity || 1)
    colors = Number(colors || 1)

    let baseCost = 5

    if (printType === "screenprint") baseCost += 3
    if (printType === "dtf") baseCost += 2

    if (colors > 3) baseCost += 2
    if (quantity > 50) baseCost -= 1

    const totalCost = baseCost * quantity

    const marginTarget = quantity > 50 ? 0.4 : 0.5

    const suggestedPrice = totalCost / (1 - marginTarget)

    const profit = suggestedPrice - totalCost

    res.json({
      totalCost: totalCost.toFixed(2),
      suggestedPrice: suggestedPrice.toFixed(2),
      profit: profit.toFixed(2),
      margin: (marginTarget * 100).toFixed(0)
    })

  } catch (err) {
    console.error("❌ AI PRICING ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
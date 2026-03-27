import express from "express"

const router = express.Router()

router.post("/", (req, res) => {
  try {
    const { quantity = 1, printType = "screenprint" } = req.body

    let baseCost = 5
    let printCost = 0

    if (printType === "screenprint") {
      printCost = 1.25
    }

    if (printType === "dtf") {
      printCost = 4
    }

    const totalCost = (baseCost + printCost) * quantity

    const markup = 2.2

    const suggestedPrice = Math.round(totalCost * markup)

    res.json({
      cost: totalCost,
      suggestedPrice
    })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
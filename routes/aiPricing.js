import express from "express"

const router = express.Router()

router.post("/", (req, res) => {
  try {
    const { quantity = 1, printType = "screenprint" } = req.body

    let base = 5
    let printCost = 0

    if (printType === "screenprint") printCost = 1.25
    if (printType === "dtf") printCost = 4

    const cost = (base + printCost) * quantity
    const suggestedPrice = Math.round(cost * 2.2)

    res.json({ cost, suggestedPrice })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
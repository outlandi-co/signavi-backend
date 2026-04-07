import express from "express"

const router = express.Router()

router.post("/", (req, res) => {
  const { quantity = 1, printType } = req.body

  let base = 10

  if (printType === "screenprint") base = 12
  if (printType === "dtf") base = 15

  const total = base * quantity

  res.json({
    suggestedPrice: total
  })
})

export default router
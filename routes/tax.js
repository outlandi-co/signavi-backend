import express from "express"

const router = express.Router()

router.post("/calculate", (req, res) => {
  try {
    const { subtotal } = req.body

    const TAX_RATE = 0.0825
    const tax = Math.round(Number(subtotal) * TAX_RATE * 100) / 100

    res.json({ tax })

  } catch {
    res.json({ tax: 0 })
  }
})

export default router
import express from "express"

const router = express.Router()

/* ================= CALCULATE SHIPPING ================= */
router.post("/calculate", async (req, res) => {
  try {
    const { subtotal } = req.body

    let shipping = 0

    if (subtotal > 100) shipping = 0
    else if (subtotal > 50) shipping = 5.99
    else shipping = 9.99

    res.json({ shipping })

  } catch (err) {
    console.error("❌ SHIPPING ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"

const router = express.Router()

/* ================= CALCULATE TAX ================= */
router.post("/calculate", async (req, res) => {
  try {
    const { zip, subtotal } = req.body

    console.log("📦 TAX REQUEST:", { zip, subtotal })

    if (!zip || !subtotal) {
      return res.json({ tax: 0 })
    }

    /* ================= SIMPLE CA TAX ================= */
    // 🔥 Default California sales tax (~8.25%)
    const TAX_RATE = 0.0825

    const tax = Math.round(Number(subtotal) * TAX_RATE * 100) / 100

    console.log("✅ TAX CALCULATED:", tax)

    res.json({ tax })

  } catch (err) {
    console.error("❌ TAX ERROR:", err)
    res.json({ tax: 0 })
  }
})

export default router
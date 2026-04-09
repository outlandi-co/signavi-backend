import express from "express"

const router = express.Router()

/* ================= ESTIMATE TAX + SHIPPING ================= */
router.post("/", async (req, res) => {
  try {
    const { zip, subtotal } = req.body

    if (!zip || !subtotal) {
      return res.status(400).json({
        message: "Missing zip or subtotal"
      })
    }

    /* 🔥 SIMPLE TAX LOGIC (expand later) */
    let taxRate = 0.08 // default CA

    if (zip.startsWith("9")) {
      taxRate = 0.0825 // California avg
    }

    /* 🚚 SHIPPING LOGIC */
    let shipping = 599 // $5.99 base

    if (subtotal > 100) shipping = 799
    if (subtotal > 200) shipping = 0

    const tax = subtotal * taxRate

    res.json({
      taxRate,
      tax,
      shipping,
      total: subtotal + tax + shipping
    })

  } catch (err) {
    console.error("❌ ESTIMATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
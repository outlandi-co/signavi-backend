import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    )

    res.json(updated)
  } catch (err) {
    console.error("ORDER STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= TRACKING ================= */
router.patch("/:id/tracking", async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { trackingNumber: req.body.trackingNumber },
      { new: true }
    )

    res.json(updated)
  } catch (err) {
    console.error("ORDER TRACKING ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
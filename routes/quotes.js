import express from "express"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    res.json({ success: true, data: quote })
  } catch (err) {
    res.status(500).json({ message: "Failed to load quote" })
  }
})

/* ================= UPDATE ================= */
router.patch("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })

    if (req.body.price !== undefined) {
      quote.price = Number(req.body.price)
    }

    if (req.body.shippingCost !== undefined) {
      quote.shippingCost = Number(req.body.shippingCost)
    }

    if (req.body.approvalStatus) {
      quote.approvalStatus = req.body.approvalStatus
    }

    await quote.save()

    res.json({ success: true, data: quote })

  } catch (err) {
    res.status(500).json({ message: "Update failed" })
  }
})

export default router
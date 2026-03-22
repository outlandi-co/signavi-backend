import express from "express"
import Cart from "../models/Cart.js"
import { sendAbandonedCartEmail } from "../utils/sendAbandonedCartEmail.js"

const router = express.Router()

/* ================= GET ALL ABANDONED ================= */
router.get("/", async (req, res) => {
  try {
    const carts = await Cart.find({
      abandonedEmailSent: true,
      recovered: false
    }).sort({ updatedAt: -1 })

    const data = carts.map(cart => ({
      _id: cart._id,
      email: cart.email,
      items: cart.items,
      total: cart.items.reduce((acc, i) => acc + i.price * i.quantity, 0),
      updatedAt: cart.updatedAt
    }))

    res.json(data)

  } catch (err) {
    console.error("❌ ABANDONED FETCH ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

/* ================= RESEND EMAIL ================= */
router.post("/resend/:id", async (req, res) => {
  try {
    const cart = await Cart.findById(req.params.id)

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" })
    }

    await sendAbandonedCartEmail(cart)

    res.json({ success: true })

  } catch (err) {
    console.error("❌ RESEND ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
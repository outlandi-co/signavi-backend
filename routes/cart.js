import express from "express"
import Cart from "../models/Cart.js"

const router = express.Router()

/* ================= SAVE CART ================= */
router.post("/save", async (req, res) => {
  try {
    const { email, items } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email required" })
    }

    let cart = await Cart.findOne({ email })

    if (cart) {
      cart.items = items

      /* 🔥 RESET FLAGS WHEN USER RETURNS */
      cart.recovered = true
      cart.abandonedEmailSent = false

      await cart.save()
    } else {
      cart = await Cart.create({
        email,
        items,
        recovered: true
      })
    }

    res.json(cart)

  } catch (err) {
    console.error("❌ CART SAVE ERROR:", err)

    res.status(500).json({
      error: "Failed to save cart"
    })
  }
})

/* ================= GET CART ================= */
router.get("/:email", async (req, res) => {
  try {
    const cart = await Cart.findOne({ email: req.params.email })

    if (!cart) {
      return res.json({ items: [] })
    }

    res.json(cart)

  } catch (err) {
    console.error("❌ CART FETCH ERROR:", err)

    res.status(500).json({
      error: "Failed to fetch cart"
    })
  }
})

export default router
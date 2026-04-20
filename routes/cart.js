import express from "express"
import Cart from "../models/Cart.js"
import { sendAbandonedCartEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= TRACK CART ================= */
router.post("/track", async (req, res) => {
  try {
    const { email, cart } = req.body

    if (!email || !cart?.length) {
      return res.status(400).json({ message: "Missing data" })
    }

    let cartDoc = await Cart.findOneAndUpdate(
      { email, recovered: false },
      {
        items: cart.map(i => ({
          productId: i._id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          image: i.image
        }))
      },
      { new: true, upsert: true }
    )

    if (!cartDoc.abandonedEmailSent) {

      setTimeout(async () => {
        const fresh = await Cart.findById(cartDoc._id)

        if (!fresh || fresh.recovered) return

        fresh.discountCode = "SAVE10"
        fresh.discountPercent = 10
        fresh.abandonedEmailSent = true

        await fresh.save()

        await sendAbandonedCartEmail(email, fresh)

      }, 1000 * 60 * 10)
    }

    res.json({ success: true })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET DISCOUNT ================= */
router.post("/discount", async (req, res) => {
  try {
    const { email } = req.body

    const cart = await Cart.findOne({ email, recovered: false })

    if (!cart) {
      return res.json({ discountPercent: 0 })
    }

    res.json({
      discountPercent: cart.discountPercent || 0,
      code: cart.discountCode || ""
    })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= MARK RECOVERED ================= */
router.post("/recovered", async (req, res) => {
  try {
    const { email } = req.body

    await Cart.updateMany(
      { email },
      { recovered: true }
    )

    res.json({ success: true })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
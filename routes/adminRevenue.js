import express from "express"
import Order from "../models/Order.js"
import Cart from "../models/Cart.js"

const router = express.Router()

/* ================= REVENUE DASHBOARD ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find()
    const carts = await Cart.find()

    const totalRevenue = orders.reduce((sum, o) => {
      return sum + (o.finalPrice || o.total || 0)
    }, 0)

    const totalOrders = orders.length

    const abandoned = carts.filter(c => !c.recovered)
    const recovered = carts.filter(c => c.recovered)

    const abandonedValue = abandoned.reduce((sum, c) => {
      return sum + c.items.reduce((s, i) => s + (i.price * i.quantity), 0)
    }, 0)

    const recoveredValue = recovered.reduce((sum, c) => {
      return sum + c.items.reduce((s, i) => s + (i.price * i.quantity), 0)
    }, 0)

    const conversionRate =
      carts.length > 0
        ? ((recovered.length / carts.length) * 100).toFixed(1)
        : 0

    res.json({
      totalRevenue,
      totalOrders,
      abandonedCarts: abandoned.length,
      recoveredCarts: recovered.length,
      abandonedValue,
      recoveredValue,
      conversionRate
    })

  } catch (err) {
    console.error("REVENUE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
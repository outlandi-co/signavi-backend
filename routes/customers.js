import express from "express"
import User from "../models/User.js"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= GET CUSTOMERS ================= */
router.get("/", async (req, res) => {
  try {
    const users = await User.find({ role: "customer" })

    const customers = await Promise.all(
      users.map(async (user) => {

        const orders = await Order.find({ email: user.email })

        const totalSpent = orders.reduce((sum, o) => {
          return sum + (o.finalPrice || 0)
        }, 0)

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          totalOrders: orders.length,
          totalSpent
        }
      })
    )

    res.json(customers)

  } catch (err) {
    console.error("CUSTOMERS ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router
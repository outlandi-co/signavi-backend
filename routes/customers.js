import express from "express"
import User from "../models/User.js"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= GET ALL CUSTOMERS ================= */
router.get("/", async (req, res) => {
  try {

    const users = await User.find({ role: "customer" }).lean()

    const customers = await Promise.all(
      users.map(async (user) => {

        const orders = await Order.find({ email: user.email }).lean()

        const totalSpent = orders.reduce((sum, o) => {
          return sum + (o.finalPrice || o.price || 0)
        }, 0)

        return {
          _id: user._id,
          name: user.name || "",
          email: user.email,
          totalOrders: orders.length,
          totalSpent
        }
      })
    )

    res.json(customers)

  } catch (err) {
    console.error("CUSTOMERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET CUSTOMER ORDERS ================= */
router.get("/orders/:email", async (req, res) => {
  try {

    const email = req.params.email.toLowerCase()

    const orders = await Order.find({ email })
      .sort({ createdAt: -1 })

    res.json(orders)

  } catch (err) {
    console.error("CUSTOMER ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
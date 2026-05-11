import express from "express"
import mongoose from "mongoose"
import User from "../models/User.js"
import Order from "../models/Order.js"

const router = express.Router()

/* ================= HELPER ================= */

const safeEmail = (value) => {
  if (!value || typeof value !== "string") return null
  return value.trim().toLowerCase()
}

/* ================= GET ALL CUSTOMERS ================= */

router.get("/", async (req, res) => {
  try {
    const users = await User.find({ role: "customer" }).lean()

    const customers = await Promise.all(
      users.map(async (user) => {
        const userEmail = safeEmail(user?.email)

        if (!userEmail) {
          return {
            _id: user?._id,
            name: user?.name || "",
            email: "",
            totalOrders: 0,
            totalSpent: 0
          }
        }

        const orders = await Order.find({ email: userEmail }).lean()

        const totalSpent = orders.reduce((sum, o) => {
          return sum + Number(o?.finalPrice || o?.price || 0)
        }, 0)

        return {
          _id: user._id,
          name: user?.name || "",
          email: userEmail,
          totalOrders: orders.length,
          totalSpent
        }
      })
    )

    res.json({
      success: true,
      data: customers
    })
  } catch (err) {
    console.error("❌ CUSTOMERS ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= GET CUSTOMER ORDERS ================= */

router.get("/orders/:email", async (req, res) => {
  try {
    const email = safeEmail(req.params?.email)

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Valid email param required"
      })
    }

    const orders = await Order.find({ email }).sort({
      createdAt: -1
    })

    res.json({
      success: true,
      data: orders
    })
  } catch (err) {
    console.error("❌ CUSTOMER ORDERS ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= GET CUSTOMER BY ID ================= */
/* Keep this AFTER /orders/:email */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer id"
      })
    }

    const user = await User.findOne({
      _id: id,
      role: "customer"
    }).lean()

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      })
    }

    const email = safeEmail(user.email)

    const orders = email
      ? await Order.find({ email }).sort({ createdAt: -1 }).lean()
      : []

    const totalSpent = orders.reduce((sum, o) => {
      return sum + Number(o?.finalPrice || o?.price || 0)
    }, 0)

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name || "",
        email: email || "",
        phone: user.phone || "",
        role: user.role,
        totalOrders: orders.length,
        totalSpent,
        orders,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    })
  } catch (err) {
    console.error("❌ CUSTOMER DETAIL ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message || "Failed to load customer"
    })
  }
})

export default router
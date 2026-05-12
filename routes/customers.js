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

const getOrderTotal = (order) => {
  return Number(
    order?.finalPrice ||
    order?.total ||
    order?.subtotal ||
    order?.price ||
    0
  )
}

/* ================= GET ALL CUSTOMERS ================= */

router.get("/", async (req, res) => {
  try {
    const users = await User.find({ role: "customer" }).lean()
    const orders = await Order.find().lean()

    const customerMap = new Map()

    users.forEach(user => {
      const email = safeEmail(user?.email)
      if (!email) return

      customerMap.set(email, {
        _id: String(user._id),
        userId: user._id,
        name: user.name || "",
        email,
        phone: user.phone || "",
        role: user.role || "customer",
        customerType: "registered",
        totalOrders: 0,
        totalSpent: 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      })
    })

    orders.forEach(order => {
      const email = safeEmail(order?.email)
      if (!email) return

      const existing = customerMap.get(email) || {
        _id: email,
        userId: null,
        name:
          order.customerName ||
          order.name ||
          "Guest Customer",
        email,
        phone: order.phone || "",
        role: "guest",
        customerType: "order",
        totalOrders: 0,
        totalSpent: 0,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }

      existing.name =
        existing.name ||
        order.customerName ||
        order.name ||
        "Guest Customer"

      existing.phone =
        existing.phone ||
        order.phone ||
        ""

      existing.totalOrders += 1
      existing.totalSpent += getOrderTotal(order)

      if (!existing.lastOrderAt || order.createdAt > existing.lastOrderAt) {
        existing.lastOrderAt = order.createdAt
      }

      customerMap.set(email, existing)
    })

    const customers = Array.from(customerMap.values()).sort((a, b) => {
      const dateA = new Date(a.lastOrderAt || a.createdAt || 0).getTime()
      const dateB = new Date(b.lastOrderAt || b.createdAt || 0).getTime()

      return dateB - dateA
    })

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

/* ================= GET CUSTOMER BY ID OR EMAIL ================= */
/* Keep this AFTER /orders/:email */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    let user = null
    let email = null

    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findOne({
        _id: id,
        role: "customer"
      }).lean()

      email = safeEmail(user?.email)
    } else {
      email = safeEmail(decodeURIComponent(id))
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer id or email"
      })
    }

    const orders = await Order.find({ email })
      .sort({ createdAt: -1 })
      .lean()

    if (!user) {
      user = await User.findOne({
        email,
        role: "customer"
      }).lean()
    }

    if (!user && orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      })
    }

    const totalSpent = orders.reduce((sum, order) => {
      return sum + getOrderTotal(order)
    }, 0)

    const firstOrder = orders[0]

    res.json({
      success: true,
      data: {
        _id: user?._id || email,
        userId: user?._id || null,
        name:
          user?.name ||
          firstOrder?.customerName ||
          firstOrder?.name ||
          "Guest Customer",
        email,
        phone:
          user?.phone ||
          firstOrder?.phone ||
          "",
        role: user?.role || "guest",
        customerType: user ? "registered" : "order",
        status: user ? "Standard" : "Guest",
        totalOrders: orders.length,
        totalSpent,
        orders,
        createdAt: user?.createdAt || firstOrder?.createdAt,
        updatedAt: user?.updatedAt || firstOrder?.updatedAt
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
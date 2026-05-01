import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"

const router = express.Router()

/* =========================================================
   💰 PROFIT SUMMARY
========================================================= */
router.get("/profit-summary", async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: "denied" } })

    let revenue = 0
    let profit = 0

    orders.forEach(o => {
      const total = Number(o.subtotal || o.finalPrice || 0)
      revenue += total
      profit += Number(o.profit || 0)
    })

    const avgMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    res.json({
      success: true,
      data: {
        revenue: Number(revenue.toFixed(2)),
        profit: Number(profit.toFixed(2)),
        avgMargin: Number(avgMargin.toFixed(2)),
        count: orders.length
      }
    })
  } catch (err) {
    console.error("❌ PROFIT SUMMARY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📊 ANALYTICS
========================================================= */
router.get("/analytics", async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: "denied" } })

    const revenueMap = {}
    const productMap = {}

    orders.forEach(order => {
      const total = Number(order.subtotal || order.finalPrice || 0)

      const date = new Date(order.createdAt).toISOString().slice(0, 10)

      revenueMap[date] = (revenueMap[date] || 0) + total

      order.items?.forEach(item => {
        const key = item.name || "Unknown"

        if (!productMap[key]) {
          productMap[key] = { name: key, quantity: 0, revenue: 0 }
        }

        const itemRevenue = Number(item.price || 0) * Number(item.quantity || 0)

        productMap[key].quantity += Number(item.quantity || 0)
        productMap[key].revenue += itemRevenue
      })
    })

    const revenueByDay = Object.entries(revenueMap)
      .map(([date, total]) => ({
        date,
        total: Number(total.toFixed(2))
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    const topProducts = Object.values(productMap)
      .map(p => ({
        ...p,
        revenue: Number(p.revenue.toFixed(2))
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const lowMarginOrders = orders
      .filter(o => Number(o.margin || 0) < 20)
      .map(o => ({
        id: o._id,
        customer: o.customerName,
        margin: Number(o.margin || 0),
        total: Number(o.finalPrice || 0)
      }))

    res.json({
      success: true,
      data: {
        revenueByDay,
        topProducts,
        lowMarginOrders,
        orders // 🔥 optional for dashboard drill-down
      }
    })

  } catch (err) {
    console.error("❌ ANALYTICS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🧠 CUSTOMER LIFETIME VALUE (CLV)
========================================================= */
router.get("/customers-value", async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: "denied" } })

    const map = {}

    orders.forEach(o => {
      const email = o.email || "guest"

      if (!map[email]) {
        map[email] = {
          email,
          orders: 0,
          totalSpent: 0
        }
      }

      const total = Number(o.subtotal || o.finalPrice || 0)

      map[email].orders += 1
      map[email].totalSpent += total
    })

    const customers = Object.values(map)
      .map(c => ({
        ...c,
        totalSpent: Number(c.totalSpent.toFixed(2))
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)

    res.json({ success: true, data: customers })

  } catch (err) {
    console.error("❌ CLV ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔁 RECALCULATE PROFIT (FAST + SAFE)
========================================================= */
router.post("/recalculate-profit", async (req, res) => {
  try {
    const orders = await Order.find()

    let updated = 0

    for (let order of orders) {
      await order.save()
      updated++
    }

    console.log(`✅ Recalculated ${updated} orders`)

    res.json({
      success: true,
      message: `Updated ${updated} orders`
    })
  } catch (err) {
    console.error("❌ RECALC ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 GET ALL ORDERS
========================================================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   👤 CUSTOMER ORDERS
========================================================= */
router.get("/my-orders", async (req, res) => {
  try {
    const email = req.query?.email?.toLowerCase()

    if (!email) {
      return res.status(400).json({ message: "Email required" })
    }

    const orders = await Order.find({ email }).sort({ createdAt: -1 })

    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ MY ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET SINGLE ORDER (LAST)
========================================================= */
router.get("/:id", async (req, res) => {
  const { id } = req.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid order ID" })
  }

  try {
    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
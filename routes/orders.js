import express from "express"
import mongoose from "mongoose"
import axios from "axios"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()
const BASE_URL = process.env.BASE_URL || "http://localhost:5050"

/* =========================================================
   💰 PROFIT SUMMARY
========================================================= */
router.get("/profit-summary", async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $ne: "denied" }
    })

    let revenue = 0
    let profit = 0

    orders.forEach(o => {
      revenue += Number(o.finalPrice || 0)
      profit += Number(o.profit || 0)
    })

    const avgMargin =
      revenue > 0 ? (profit / revenue) * 100 : 0

    res.json({
      success: true,
      data: {
        revenue,
        profit,
        avgMargin,
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
    const orders = await Order.find({
      status: { $ne: "denied" }
    })

    const revenueMap = {}
    const productMap = {}

    orders.forEach(order => {

      const date = new Date(order.createdAt)
        .toISOString()
        .slice(0, 10)

      revenueMap[date] =
        (revenueMap[date] || 0) +
        Number(order.finalPrice || 0)

      order.items?.forEach(item => {
        const key = item.name || "Unknown"

        if (!productMap[key]) {
          productMap[key] = {
            name: key,
            quantity: 0,
            revenue: 0
          }
        }

        productMap[key].quantity += Number(item.quantity || 0)
        productMap[key].revenue +=
          Number(item.price || 0) * Number(item.quantity || 0)
      })
    })

    const revenueByDay = Object.entries(revenueMap)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const lowMarginOrders = orders
      .filter(o => Number(o.margin || 0) < 20)
      .map(o => ({
        id: o._id,
        customer: o.customerName,
        margin: o.margin,
        total: o.finalPrice
      }))

    res.json({
      success: true,
      data: {
        revenueByDay,
        topProducts,
        lowMarginOrders
      }
    })

  } catch (err) {
    console.error("❌ ANALYTICS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔁 RECALCULATE PROFIT (RUN ONCE)
========================================================= */
router.post("/recalculate-profit", async (req, res) => {
  try {
    const orders = await Order.find()

    let updated = 0

    for (let order of orders) {
      order.cogs = order.cogs || 0
      order.markModified("cogs")

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
   📦 GET ALL
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
   📄 GET SINGLE ORDER
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

/* =========================================================
   🛒 CREATE ORDER
========================================================= */
router.post("/", async (req, res) => {
  try {
    let { customerName, email, items = [] } = req.body

    if (!email) email = "guest@signavi.com"

    if (!items.length) {
      return res.status(400).json({ message: "Items required" })
    }

    const subtotal = items.reduce(
      (sum, i) => sum + (Number(i.price) * Number(i.quantity)),
      0
    )

    const tax = subtotal * 0.0825

    const order = new Order({
      customerName: customerName || "Guest",
      email: email.toLowerCase(),
      items,
      subtotal,
      tax,
      finalPrice: subtotal + tax,
      status: "payment_required",
      source: "store",
      timeline: [
        {
          status: "payment_required",
          note: "Order created",
          date: new Date()
        }
      ]
    })

    await order.save()

    sendOrderStatusEmail(order.email, "payment_required", order._id, order)
      .catch(err => console.error("EMAIL FAIL:", err.message))

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🚚 SHIP ORDER
========================================================= */
router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order || !order.shippingAddress) {
      return res.status(400).json({ message: "Missing order or address" })
    }

    const shipRes = await axios.post(
      `${BASE_URL}/api/shipping/create-shipment`,
      {
        address_to: order.shippingAddress
      }
    )

    order.trackingNumber = shipRes.data.trackingNumber
    order.trackingLink = shipRes.data.trackingLink
    order.shippingLabel = shipRes.data.labelUrl
    order.status = "shipped"

    order.timeline.push({
      status: "shipped",
      note: "Order shipped",
      date: new Date()
    })

    await order.save()

    sendOrderStatusEmail(order.email, "shipped", order._id, order)
      .catch(err => console.error("EMAIL FAIL:", err.message))

    req.app.get("io")?.emit("jobUpdated")

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: "Shipping failed" })
  }
})

export default router
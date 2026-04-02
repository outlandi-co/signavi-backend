import express from "express"
import Order from "../models/Order.js"
import Expense from "../models/Expense.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { createShippingLabel } from "../services/shippingService.js"

const router = express.Router()

/* ================= ANALYTICS ================= */
router.get("/analytics", async (req, res) => {
  try {
    const orders = await Order.find()
    const expenses = await Expense.find()

    let totalRevenue = 0
    let totalFees = 0
    let totalCOGS = 0
    let totalExpenses = 0

    const monthlyMap = {}
    const productMap = {}

    orders.forEach(order => {
      const revenue = order.amountReceived || 0
      const fees = order.stripeFee || 0
      const cogs = order.cogs || 0

      const profit = revenue - fees - cogs

      totalRevenue += revenue
      totalFees += fees
      totalCOGS += cogs

      const month = new Date(order.createdAt).toLocaleString("default", {
        month: "short"
      })

      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, revenue: 0, profit: 0 }
      }

      monthlyMap[month].revenue += revenue / 100
      monthlyMap[month].profit += profit / 100

      const name = order.printType || "Custom"

      if (!productMap[name]) {
        productMap[name] = { name, revenue: 0, profit: 0 }
      }

      productMap[name].revenue += revenue / 100
      productMap[name].profit += profit / 100
    })

    expenses.forEach(exp => {
      totalExpenses += exp.amount

      const month = new Date(exp.createdAt).toLocaleString("default", {
        month: "short"
      })

      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, revenue: 0, profit: 0 }
      }

      monthlyMap[month].profit -= exp.amount
    })

    const totalProfit =
      (totalRevenue / 100) -
      (totalFees / 100) -
      (totalCOGS / 100) -
      totalExpenses

    res.json({
      totalRevenue: totalRevenue / 100,
      totalFees: totalFees / 100,
      totalCOGS: totalCOGS / 100,
      totalExpenses,
      totalProfit,
      monthly: Object.values(monthlyMap),
      products: Object.values(productMap)
    })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json(orders)
})

router.get("/:id", async (req, res) => {
  const order = await Order.findById(req.params.id)
  if (!order) return res.status(404).json({ message: "Not found" })
  res.json(order)
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Not found" })

    const statusMap = {
      production: "paid",
      shipping: "shipped"
    }

    const mappedStatus = statusMap[status] || status

    const lastStatus = order.timeline?.at(-1)?.status

    if (lastStatus !== mappedStatus) {
      order.timeline.push({
        status: mappedStatus,
        date: new Date()
      })
    }

    order.status = mappedStatus

    /* ================= SHIPPING ================= */
    if (mappedStatus === "shipped" && !order.trackingNumber) {
      const shipment = await createShippingLabel(order)

      order.trackingNumber = shipment.trackingNumber
      order.trackingLink = shipment.trackingLink
      order.shippingLabel = shipment.labelUrl

      order.carrier = shipment.carrier
      order.serviceLevel = shipment.service
    }

    await order.save()

    req.app.get("io")?.emit("jobUpdated", order)

    if (order.email) {
      await sendOrderStatusEmail(order.email, mappedStatus, order._id, order)
    }

    res.json({ success: true, order })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import Order from "../models/Order.js"
import Expense from "../models/Expense.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { createShippingLabel } from "../services/shippingService.js"
import { generateBulkLabels } from "../utils/labelGenerator.js"
import { requireAuth } from "../middleware/requireAuth.js"
import { generateInvoice } from "../utils/invoiceGenerator.js"

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

    orders.forEach(o => {
      totalRevenue += o.amountReceived || 0
      totalFees += o.stripeFee || 0
      totalCOGS += o.cogs || 0
    })

    expenses.forEach(e => {
      totalExpenses += e.amount
    })

    res.json({
      totalRevenue: totalRevenue / 100,
      totalProfit:
        totalRevenue / 100 -
        totalFees / 100 -
        totalCOGS / 100 -
        totalExpenses
    })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= CUSTOMER ORDERS ================= */
router.get("/my-orders", requireAuth, async (req, res) => {
  try {
    const email = (req.user?.email || "").toLowerCase().trim()

    const orders = await Order.find({
      email: { $regex: new RegExp(`^${email}$`, "i") }
    }).sort({ createdAt: -1 })

    res.json(orders)

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json(orders)
})

/* ================= GET ONE ================= */
router.get("/:id", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id)

  if (!order) {
    return res.status(404).json({ message: "Not found" })
  }

  /* 🔥 SECURITY: ONLY OWNER CAN VIEW */
  if (order.email !== req.user.email) {
    return res.status(403).json({ message: "Unauthorized" })
  }

  res.json(order)
})

/* ================= DOWNLOAD INVOICE ================= */
router.get("/:id/invoice", requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const filePath = await generateInvoice(order)

    res.download(filePath)

  } catch (err) {
    console.error("❌ INVOICE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= REORDER ================= */
router.post("/:id/reorder", requireAuth, async (req, res) => {
  try {
    const original = await Order.findById(req.params.id)

    if (!original) {
      return res.status(404).json({ message: "Original order not found" })
    }

    const newOrder = await Order.create({
      customerName: original.customerName,
      email: original.email,
      quantity: original.quantity,
      printType: original.printType,
      artwork: original.artwork,
      items: original.items || [],
      price: original.price,
      finalPrice: original.finalPrice,
      status: "payment_required",
      timeline: [{
        status: "payment_required",
        date: new Date(),
        note: "Reorder created"
      }]
    })

    console.log("🔁 REORDER CREATED:", newOrder._id)

    res.json({
      success: true,
      orderId: newOrder._id
    })

  } catch (err) {
    console.error("❌ REORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= BULK LABELS ================= */
router.post("/bulk-labels", async (req, res) => {
  const { ids } = req.body || {}

  if (!ids?.length) {
    return res.status(400).json({ message: "No orders selected" })
  }

  const orders = await Order.find({ _id: { $in: ids } })
  const filePath = await generateBulkLabels(orders)

  res.download(filePath)
})

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Not found" })
    }

    if (order.status === status) {
      return res.json({ success: true, order })
    }

    if (!order.timeline) order.timeline = []

    order.status = status

    order.timeline.push({
      status,
      date: new Date(),
      note: `Status changed to ${status}`
    })

    if (status === "shipping" && !order.trackingNumber) {
      try {
        const shipment = await createShippingLabel(order)

        order.trackingNumber = shipment.trackingNumber
        order.trackingLink = shipment.trackingLink
        order.shippingLabel = shipment.labelUrl
      } catch (err) {
        console.error("❌ SHIPPING ERROR:", err.message)
      }
    }

    await order.save()

    req.app.get("io")?.emit("jobUpdated", order)

    if (order.email) {
      try {
        await sendOrderStatusEmail(order.email, status, order._id, order)
      } catch (err) {
        console.error("❌ EMAIL ERROR:", err.message)
      }
    }

    res.json({ success: true, order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
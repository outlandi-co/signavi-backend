import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { requireAuth } from "../middleware/auth.js"
import jwt from "jsonwebtoken"
import fs from "fs"
import PDFDocument from "pdfkit"

const router = express.Router()

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id)

/* =========================================================
   📄 GENERATE INVOICE (SIMPLE BUILT-IN)
========================================================= */
const generateInvoice = (order) => {
  const filePath = `uploads/invoice-${order._id}.pdf`

  const doc = new PDFDocument()
  doc.pipe(fs.createWriteStream(filePath))

  doc.fontSize(20).text("Invoice", { align: "center" })
  doc.moveDown()

  doc.text(`Order ID: ${order._id}`)
  doc.text(`Customer: ${order.customerName}`)
  doc.text(`Email: ${order.email}`)
  doc.text(`Total: $${order.finalPrice}`)

  doc.moveDown()

  order.items.forEach(item => {
    doc.text(`${item.name} - ${item.quantity} x $${item.price}`)
  })

  doc.end()

  return filePath
}

/* =========================================================
   🆕 CREATE ORDER (GUEST + USER)
========================================================= */
router.post("/", async (req, res) => {
  try {
    console.log("🛒 CREATE ORDER HIT")

    let userId = null
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.id
      } catch {
        console.log("⚠️ Guest checkout")
      }
    }

    let { customerName, email, items, quantity, printType, subtotal, tax, price } = req.body || {}

    const safeItems = Array.isArray(items)
      ? items.map(item => ({
          name: item?.name || "Item",
          quantity: Number(item?.quantity) || 1,
          price: Number(item?.price) || 0
        }))
      : []

    if (!safeItems.length) {
      return res.status(400).json({ message: "No items provided" })
    }

    const computedSubtotal = safeItems.reduce(
      (acc, i) => acc + i.price * i.quantity,
      0
    )

    subtotal = Number(subtotal ?? computedSubtotal)
    tax = Number(tax ?? subtotal * 0.0825)
    price = Number(price ?? subtotal + tax)

    const totalQuantity =
      safeItems.reduce((acc, i) => acc + i.quantity, 0) ||
      Number(quantity) ||
      1

    const order = await Order.create({
      user: userId,
      customerName: customerName || "Guest",
      email: email || "",
      items: safeItems,
      quantity: totalQuantity,
      printType: printType || "custom",
      subtotal,
      tax,
      price,
      finalPrice: price,
      source: "store",
      status: "payment_required",
      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Order created"
        }
      ]
    })

    console.log("✅ ORDER CREATED:", order._id)

    if (order.email) {
      await sendOrderStatusEmail(order.email, "payment_required", order._id, order)
    }

    req.app.get("io")?.emit("jobCreated", order)

    return res.status(201).json(order)

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)
    return res.status(500).json({ message: "Order creation failed", error: err.message })
  }
})

/* =========================================================
   🚚 SHIP ORDER (NEW)
========================================================= */
router.patch("/ship/:id", requireAuth, async (req, res) => {
  try {
    const { trackingNumber, carrier, trackingLink } = req.body
    const id = req.params.id

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ message: "Not found" })

    order.status = "shipped"
    order.trackingNumber = trackingNumber || ""
    order.trackingLink = trackingLink || ""
    order.carrier = carrier || "USPS"

    order.timeline.push({
      status: "shipped",
      date: new Date(),
      note: "Order shipped"
    })

    await order.save()

    if (order.email) {
      await sendOrderStatusEmail(order.email, "shipped", order._id, order)
    }

    req.app.get("io")?.emit("jobUpdated", order)

    res.json(order)

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💳 MARK PAID + GENERATE INVOICE (NEW)
========================================================= */
router.patch("/mark-paid/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id

    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ message: "Not found" })

    order.status = "paid"

    const invoicePath = generateInvoice(order)
    order.invoice = invoicePath

    order.timeline.push({
      status: "paid",
      date: new Date(),
      note: "Payment confirmed"
    })

    await order.save()

    if (order.email) {
      await sendOrderStatusEmail(order.email, "paid", order._id, order)
    }

    req.app.get("io")?.emit("jobUpdated", order)

    res.json(order)

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🔐 EXISTING ROUTES (UNCHANGED)
========================================================= */
router.get("/my-orders", requireAuth, async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 })
  res.json(orders)
})

router.get("/", requireAuth, async (req, res) => {
  const query = req.user.role === "admin" ? {} : { user: req.user.id }
  const orders = await Order.find(query).sort({ createdAt: -1 })
  res.json(orders)
})

router.get("/:id", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id)
  res.json(order)
})

export default router
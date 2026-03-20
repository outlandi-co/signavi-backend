import express from "express"
import Order from "../models/Order.js"
import Customer from "../models/Customer.js"
import { sendOrderStatusEmail } from "../utils/emailService.js"

const router = express.Router()

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json(orders)
})

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  try {
    const { items, customer } = req.body

    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    const order = await Order.create({
      orderId: "SNV-" + Date.now(),
      items,
      total,
      status: "pending"
    })

    if (customer?.email) {
      let dbCustomer = await Customer.findOne({ email: customer.email })

      if (!dbCustomer) {
        dbCustomer = new Customer({
          name: customer.name,
          email: customer.email,
          orders: []
        })
      }

      dbCustomer.orders.push(order._id)
      await dbCustomer.save()
    }

    req.app.get("io").emit("jobUpdated")
    res.json(order)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ================= STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true }
  )

  const customer = await Customer.findOne({ orders: order._id })

  if (customer) {
    await sendOrderStatusEmail(
      customer.email,
      req.body.status,
      order.orderId
    )
  }

  req.app.get("io").emit("jobUpdated")
  res.json(order)
})

/* ================= TRACKING ================= */
router.patch("/:id/tracking", async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { trackingNumber: req.body.trackingNumber },
    { new: true }
  )

  req.app.get("io").emit("jobUpdated")
  res.json(order)
})

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  await Order.findByIdAndDelete(req.params.id)

  req.app.get("io").emit("jobUpdated")
  res.json({ message: "Deleted" })
})

export default router
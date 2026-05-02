import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* =========================================================
   🛒 CREATE ORDER
========================================================= */
router.post("/", async (req, res) => {
  try {
    const { email, items } = req.body

    if (!email || !items || items.length === 0) {
      return res.status(400).json({ message: "Missing order data" })
    }

    let subtotal = 0

    const cleanItems = items.map(item => {
      const price = Number(item.price || 0)
      const quantity = Number(item.quantity || 1)

      subtotal += price * quantity

      return {
        name: item.name,
        price,
        quantity,
        variant: item.variant || {},
        cost: item.cost || 0
      }
    })

    const TAX_RATE = 0.0825
    const tax = subtotal * TAX_RATE
    const finalPrice = subtotal + tax

    const order = await Order.create({
      email,
      customerName: "Guest",
      items: cleanItems,
      subtotal,
      tax,
      finalPrice,
      status: "payment_required",
      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Order created"
        }
      ]
    })

    console.log("🛒 ORDER CREATED:", order._id)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
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
   📄 GET ONE
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
   🔥 UPDATE STATUS
========================================================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body

    if (!status) {
      return res.status(400).json({ message: "Missing status" })
    }

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const allowedStatuses = [
      "payment_required",
      "ready_for_production",
      "production",
      "shipping",
      "shipped",
      "delivered"
    ]

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" })
    }

    order.status = status

    order.timeline.push({
      status,
      date: new Date(),
      note: `Moved to ${status}`
    })

    await order.save()

    const io = req.app.get("io")
    if (io) io.emit("orderUpdated", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💳 CHECKOUT + SQUARE PAYMENT
========================================================= */
router.patch("/:id/checkout", async (req, res) => {
  try {
    const {
      shippingAddress,
      shippingCost,
      carrier,
      serviceLevel
    } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    /* SAVE SHIPPING */
    order.shippingAddress = shippingAddress
    order.shippingCost = Number(shippingCost || 0)
    order.carrier = carrier
    order.serviceLevel = serviceLevel

    /* UPDATE TOTAL */
    order.finalPrice =
      (order.subtotal || 0) +
      (order.tax || 0) +
      order.shippingCost

    await order.save()

    /* 🔥 CALL SQUARE ROUTE */
    const baseUrl =
      process.env.BASE_URL ||
      "http://localhost:5050"

    const paymentRes = await fetch(
      `${baseUrl}/api/square/create-payment/${order._id}`,
      { method: "POST" }
    )

    const paymentData = await paymentRes.json()

    if (!paymentData?.paymentUrl) {
      throw new Error("Square payment failed")
    }

    order.paymentUrl = paymentData.paymentUrl
    await order.save()

    console.log("💳 PAYMENT LINK:", paymentData.paymentUrl)

    res.json({
      success: true,
      paymentUrl: paymentData.paymentUrl
    })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🚚 SHIP ORDER
========================================================= */
router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.status = "shipped"

    order.timeline.push({
      status: "shipped",
      date: new Date(),
      note: "Order shipped"
    })

    await order.save()

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
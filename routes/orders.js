import express from "express"
import axios from "axios"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= CREATE ORDER ================= */
router.post("/", async (req, res) => {
  try {
    console.log("📦 INCOMING ORDER:", JSON.stringify(req.body, null, 2))

    const { customerName, email, items = [] } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items are required" })
    }

    const cleanItems = items.map(item => {
      const safeColor =
        item?.variant?.color ||
        item?.selectedVariant?.color ||
        "standard"

      const safeSize =
        item?.variant?.size ||
        item?.selectedVariant?.size ||
        "M"

      return {
        productId: item.productId || item._id || item.id || null,
        name: item.name || "Item",
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0),

        variant: {
          color: safeColor.toLowerCase(),
          size: safeSize.toUpperCase()
        }
      }
    })

    const subtotal = cleanItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity)
    }, 0)

    const taxRate = 0.0825
    const tax = subtotal * taxRate
    const finalPrice = subtotal + tax

    const order = new Order({
      customerName: customerName || "Guest",
      email,
      items: cleanItems,
      quantity: cleanItems.reduce((sum, i) => sum + i.quantity, 0),
      subtotal,
      tax,
      price: subtotal,
      finalPrice,
      status: "payment_required",
      source: "store",
      timeline: [
        {
          status: "payment_required",
          note: "Order created, awaiting payment"
        }
      ]
    })

    await order.save()

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SHIP ORDER (🔥 CORE FEATURE) ================= */
router.post("/ship/:id", async (req, res) => {
  try {
    console.log("🚚 SHIPPING ORDER:", req.params.id)

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    /* 🔥 CALL SHIPPING SERVICE */
    const shipRes = await axios.post(
      `${process.env.BASE_URL}/api/shipping/create-shipment`,
      {
        address_to: {
          name: order.customerName,
          street1: "123 Customer St", // 🔥 REPLACE WITH REAL DATA LATER
          city: "Merced",
          state: "CA",
          zip: "95340",
          country: "US"
        }
      }
    )

    console.log("📦 SHIPPO RESPONSE:", shipRes.data)

    /* 🔥 SAVE SHIPPING DATA */
    order.trackingNumber = shipRes.data.trackingNumber || ""
    order.trackingLink = shipRes.data.trackingLink || ""
    order.shippingLabel = shipRes.data.labelUrl || ""

    order.status = "shipped"

    order.timeline.push({
      status: "shipped",
      date: new Date(),
      note: "Order shipped"
    })

    await order.save()

    /* 🔥 SEND EMAIL */
    await sendOrderStatusEmail(
      order.email,
      "shipped",
      order._id,
      order
    )

    /* 🔥 SOCKET UPDATE */
    const io = req.app.get("io")
    if (io) {
      io.emit("jobUpdated")
    }

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: "Shipping failed" })
  }
})

/* ================= GET MY ORDERS ================= */
router.get("/my-orders", async (req, res) => {
  try {
    console.log("📥 FETCH MY ORDERS")

    const email = req.query.email

    if (!email) {
      return res.status(400).json({
        message: "Email required"
      })
    }

    const orders = await Order.find({ email })
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: orders
    })

  } catch (err) {
    console.error("❌ MY ORDERS ERROR:", err)

    res.status(500).json({
      message: "Failed to fetch orders"
    })
  }
})

/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      data: orders
    })
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch orders" })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json({
      success: true,
      data: order
    })
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch order" })
  }
})

export default router
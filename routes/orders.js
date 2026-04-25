import express from "express"
import Order from "../models/Order.js"

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
      source: "store"
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

/* ================= GET MY ORDERS (🔥 FIX) ================= */
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

    console.log("✅ ORDERS FOUND:", orders.length)

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
    const orders = await Order.find().sort({ createdAt: -1 })

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
import express from "express"
import jwt from "jsonwebtoken"
import Order from "../models/Order.js"
import Product from "../models/Product.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   🛒 CREATE ORDER
========================================================= */
router.post("/", async (req, res) => {
  try {
    console.log("🛒 CREATE ORDER HIT")

    let userId = null
    let userEmail = ""

    const authHeader = req.headers.authorization

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.id
        userEmail = decoded.email || ""
      } catch {
        console.log("⚠️ Guest checkout")
      }
    }

    const { customerName, email, items } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" })
    }

    let total = 0
    let totalQuantity = 0
    const processedItems = []

    for (const item of items) {

      const productId = item.productId || item._id
      if (!productId) {
        return res.status(400).json({ message: "Missing productId" })
      }

      const product = await Product.findById(productId)
      if (!product) {
        return res.status(400).json({ message: "Product not found" })
      }

      const selectedVariant = item.selectedVariant || {}
      if (!selectedVariant.color || !selectedVariant.size) {
        return res.status(400).json({ message: "Invalid variant data" })
      }

      const incomingColor = String(selectedVariant.color).trim().toLowerCase()
      const incomingSize = String(selectedVariant.size).trim().toUpperCase()

      const variant = product.variants.find(v => {
        const dbColor = String(v.color || "").trim().toLowerCase()
        const dbSize = String(v.size || "").trim().toUpperCase()
        return dbColor === incomingColor && dbSize === incomingSize
      })

      if (!variant) {
        return res.status(400).json({
          message: `Variant not found: ${selectedVariant.color} / ${selectedVariant.size}`
        })
      }

      const qty = Number(item.quantity) || 1

      if (variant.stock < qty) {
        return res.status(400).json({
          message: `${product.name} (${variant.size}) only has ${variant.stock} left`
        })
      }

      const price = Number(variant.price || 0)
      const lineTotal = price * qty

      total += lineTotal
      totalQuantity += qty

      processedItems.push({
        name: product.name,
        quantity: qty,
        price,
        variant: {
          color: variant.color,
          size: variant.size
        }
      })
    }

    const order = await Order.create({
      user: userId,
      customerName: customerName || "Guest",
      email: email || userEmail || "",
      items: processedItems,
      quantity: totalQuantity,
      subtotal: total,
      tax: total * 0.0825,
      price: total * 1.0825,
      finalPrice: total * 1.0825,
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
    console.error("❌ ORDER ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   👤 GET MY ORDERS (BULLETPROOF)
========================================================= */
router.get("/my-orders", async (req, res) => {
  try {
    console.log("👤 MY ORDERS HIT")

    const authHeader = req.headers.authorization

    if (!authHeader) {
      console.log("⚠️ No auth header")
      return res.json([]) // return empty instead of crash
    }

    const token = authHeader.split(" ")[1]

    if (!token) {
      console.log("⚠️ No token")
      return res.json([])
    }

    let decoded

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (err) {
      console.error("❌ TOKEN INVALID:", err.message)
      return res.json([])
    }

    console.log("🔑 USER:", decoded)

    const query = []

    if (decoded.id) {
      query.push({ user: decoded.id })
    }

    if (decoded.email) {
      query.push({ email: decoded.email })
    }

    if (query.length === 0) {
      return res.json([])
    }

    const orders = await Order.find({
      $or: query
    }).sort({ createdAt: -1 })

    console.log("📦 ORDERS FOUND:", orders.length)

    return res.json(orders)

  } catch (err) {
    console.error("❌ MY ORDERS ERROR:", err)
    return res.status(500).json({ message: "Server error" })
  }
})

/* =========================================================
   📦 GET ORDER BY ID
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    res.json(order)

  } catch (err) {
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

/* =========================================================
   🚚 UPDATE SHIPPING
========================================================= */
router.patch("/update-shipping/:id", async (req, res) => {
  try {
    const { trackingNumber, trackingLink, carrier } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.trackingNumber = trackingNumber
    order.trackingLink = trackingLink
    order.carrier = carrier
    order.status = "shipped"

    order.timeline = order.timeline || []
    order.timeline.push({
      status: "shipped",
      date: new Date(),
      note: "Order shipped"
    })

    await order.save()

    req.app.get("io")?.emit("jobUpdated", order)

    if (order.email) {
      await sendOrderStatusEmail(order.email, "shipped", order._id, order)
    }

    res.json(order)

  } catch (err) {
    console.error("❌ SHIPPING ERROR:", err)
    res.status(500).json({ message: "Error updating shipping" })
  }
})

export default router
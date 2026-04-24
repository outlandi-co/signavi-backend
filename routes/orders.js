import express from "express"
import jwt from "jsonwebtoken"
import Order from "../models/Order.js"
import Product from "../models/Product.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

router.post("/", async (req, res) => {
  try {
    console.log("🛒 CREATE ORDER HIT")

    let userId = null
    const authHeader = req.headers.authorization

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.id
      } catch {
        console.log("⚠️ Guest checkout")
      }
    }

    const { customerName, email, items } = req.body

    console.log("🧪 ITEMS RECEIVED:", items)

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" })
    }

    let total = 0
    let totalQuantity = 0
    const processedItems = []

    for (const item of items) {

      /* ================= PRODUCT ID SAFE ================= */
      const productId = item.productId || item._id

      if (!productId) {
        console.error("❌ Missing productId:", item)
        return res.status(400).json({ message: "Missing productId" })
      }

      const product = await Product.findById(productId)

      if (!product) {
        console.error("❌ Product not found:", productId)
        return res.status(400).json({ message: "Product not found" })
      }

      /* ================= VARIANT SAFE ================= */
      const selectedVariant = item.selectedVariant || {}

      if (!selectedVariant.color || !selectedVariant.size) {
        console.error("❌ Invalid variant:", item)
        return res.status(400).json({ message: "Invalid variant data" })
      }

      if (!Array.isArray(product.variants) || product.variants.length === 0) {
        console.error("❌ No variants on product:", productId)
        return res.status(400).json({ message: "Product has no variants" })
      }

      const incomingColor = String(selectedVariant.color).trim().toLowerCase()
      const incomingSize = String(selectedVariant.size).trim().toUpperCase()

      console.log("🧪 MATCHING:", {
        incoming: { incomingColor, incomingSize },
        db: product.variants
      })

      const variant = product.variants.find(v => {
        const dbColor = String(v.color || "").trim().toLowerCase()
        const dbSize = String(v.size || "").trim().toUpperCase()
        return dbColor === incomingColor && dbSize === incomingSize
      })

      if (!variant) {
        console.error("❌ Variant not found:", {
          incoming: selectedVariant,
          db: product.variants
        })

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

      /* ================= PRICE ================= */
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

    /* ================= CREATE ORDER ================= */
    const order = await Order.create({
      user: userId,
      customerName: customerName || "Guest",
      email: email || "",
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
      await sendOrderStatusEmail(
        order.email,
        "payment_required",
        order._id,
        order
      )
    }

    req.app.get("io")?.emit("jobCreated", order)

    return res.status(201).json(order)

  } catch (err) {
    console.error("❌ ORDER ERROR FULL:", err)

    return res.status(500).json({
      message: err.message || "Server error during order creation"
    })
  }
})

export default router
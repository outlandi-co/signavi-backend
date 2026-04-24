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

      /* 🔒 VALIDATION */
      if (!item.productId) {
        return res.status(400).json({ message: "Missing productId" })
      }

      if (!item.selectedVariant?.color || !item.selectedVariant?.size) {
        return res.status(400).json({ message: "Invalid variant data" })
      }

      const product = await Product.findById(item.productId)

      if (!product) {
        return res.status(400).json({ message: "Product not found" })
      }

      /* 🔥 SAFE GUARD */
      if (!Array.isArray(product.variants) || product.variants.length === 0) {
        console.error("❌ NO VARIANTS ON PRODUCT:", product._id)
        return res.status(400).json({
          message: `${product.name} has no variants configured`
        })
      }

      const incomingColor = String(item.selectedVariant.color).trim().toLowerCase()
      const incomingSize = String(item.selectedVariant.size).trim().toUpperCase()

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
        console.error("❌ VARIANT NOT FOUND", {
          incoming: item.selectedVariant,
          available: product.variants
        })

        return res.status(400).json({
          message: `Variant not found: ${item.selectedVariant.color} / ${item.selectedVariant.size}`
        })
      }

      const qty = Number(item.quantity) || 1

      if (variant.stock < qty) {
        return res.status(400).json({
          message: `${product.name} (${variant.size}) only has ${variant.stock} left`
        })
      }

      const lineTotal = Number(variant.price || 0) * qty

      total += lineTotal
      totalQuantity += qty

      processedItems.push({
        name: product.name,
        quantity: qty,
        price: variant.price,
        variant: {
          color: variant.color,
          size: variant.size
        }
      })
    }

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
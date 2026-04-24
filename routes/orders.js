import express from "express"
import jwt from "jsonwebtoken"
import Order from "../models/Order.js"
import Product from "../models/Product.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* =========================================================
   🛒 CREATE ORDER (FINAL FIX - VARIANT SAFE)
========================================================= */
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

    console.log("🧪 ITEMS:", items)

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" })
    }

    let total = 0
    let totalQuantity = 0
    const processedItems = []

    /* ================= LOOP ================= */
    for (const item of items) {

      const product = await Product.findById(item.productId)

      if (!product) {
        console.error("❌ Product not found:", item.productId)
        throw new Error("Product not found")
      }

      /* 🔥 FIX: MATCH BY COLOR + SIZE */
      const variant = product.variants.find(
        v =>
          v.color?.toLowerCase() === item.selectedVariant?.color?.toLowerCase() &&
          v.size === item.selectedVariant?.size
      )

      if (!variant) {
        console.error("❌ Variant not found:", item.selectedVariant)
        throw new Error("Variant not found")
      }

      const qty = Number(item.quantity) || 1

      /* 🔥 STOCK CHECK ONLY (NO DEDUCT HERE) */
      if (variant.stock < qty) {
        throw new Error(
          `${product.name} (${variant.size}) only has ${variant.stock} left`
        )
      }

      const lineTotal = variant.price * qty

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

    /* 📧 EMAIL */
    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "payment_required",
        order._id,
        order
      )
    }

    /* 🔌 SOCKET */
    req.app.get("io")?.emit("jobCreated", order)

    return res.status(201).json(order)

  } catch (err) {
    console.error("❌ ORDER ERROR FULL:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})

export default router
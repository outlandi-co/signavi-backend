import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import multer from "multer"
import fs from "fs"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* ================= MULTER ================= */
const upload = multer({ dest: "temp/" })

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

    const tax = subtotal * 0.0825
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

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📤 UPLOAD ARTWORK (CLOUDINARY)
========================================================= */
router.post("/:id/artwork", upload.array("files", 10), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    const uploadedFiles = []

    for (const file of req.files) {
      try {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "signavi-artwork",
          resource_type: "auto"
        })

        uploadedFiles.push({
          url: result.secure_url,
          public_id: result.public_id,
          filename: file.originalname
        })

      } finally {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path)
        }
      }
    }

    order.artworks = [...(order.artworks || []), ...uploadedFiles]
    await order.save()

    res.json({ success: true, data: order.artworks })

  } catch (err) {
    console.error("❌ CLOUDINARY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📦 GET ALL
========================================================= */
router.get("/", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 })
  res.json({ success: true, data: orders })
})

/* =========================================================
   📄 GET ONE
========================================================= */
router.get("/:id", async (req, res) => {
  const id = req.params.id.trim()

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid order ID" })
  }

  const order = await Order.findById(id)

  if (!order) {
    return res.status(404).json({ message: "Order not found" })
  }

  res.json({ success: true, data: order })
})

/* =========================================================
   🔥 UPDATE STATUS
========================================================= */
router.patch("/:id/status", async (req, res) => {
  const order = await Order.findById(req.params.id)

  if (!order) {
    return res.status(404).json({ message: "Order not found" })
  }

  order.status = req.body.status

  order.timeline.push({
    status: req.body.status,
    date: new Date(),
    note: `Moved to ${req.body.status}`
  })

  await order.save()

  const io = req.app.get("io")
  if (io) io.emit("orderUpdated", order)

  res.json({ success: true, data: order })
})

/* =========================================================
   💳 CHECKOUT (SQUARE)
========================================================= */
router.patch("/:id/checkout", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const baseUrl = process.env.BASE_URL || "http://localhost:5050"

    const paymentRes = await fetch(
      `${baseUrl}/api/square/create-payment/${order._id}`,
      { method: "POST" }
    )

    const paymentData = await paymentRes.json()

    order.paymentUrl = paymentData.paymentUrl
    await order.save()

    res.json({ success: true, paymentUrl: paymentData.paymentUrl })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🚚 SHIP ORDER
========================================================= */
router.post("/ship/:id", async (req, res) => {
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
})

export default router
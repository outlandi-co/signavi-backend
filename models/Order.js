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

    const uploadedFiles = []

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "signavi-artwork",
        resource_type: "auto"
      })

      uploadedFiles.push({
        url: result.secure_url,
        public_id: result.public_id,
        filename: file.originalname
      })

      fs.unlinkSync(file.path)
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
  const id = req.params.id.trim()

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

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
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
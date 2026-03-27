import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= MULTER ================= */
const uploadPath = path.resolve("uploads")

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname)
})

const upload = multer({ storage })

/* ================= CREATE ORDER ================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {

    const name = req.body.customerName || req.body.name || "Unknown Customer"

    const newOrder = await Order.create({
      customerName: String(name).trim(),
      email: req.body.email || "",
      quantity: Number(req.body.quantity) || 1,
      printType: req.body.printType || "screenprint",
      artwork: req.file ? req.file.filename : null,

      source: req.body.source || "store",

      price: Number(req.body.price) || 0,
      finalPrice: Number(req.body.finalPrice) || 0,

      items: [],

      status: "pending",

      timeline: [
        { status: "pending", date: new Date(), note: "Order created" }
      ]
    })

    console.log("✅ ORDER CREATED:", newOrder._id)
    res.status(201).json(newOrder)

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, trackingNumber, trackingLink, price, finalPrice } = req.body

    console.log("🔥 STATUS UPDATE:", {
      id: req.params.id,
      status,
      price
    })

    let order = await Order.findById(req.params.id)

    /* ================= ORDER ================= */
    if (order) {

      if (status === "payment_required" && (!price || price <= 0)) {
        return res.status(400).json({
          message: "Price required before sending payment"
        })
      }

      if (!order.timeline) order.timeline = []

      if (status) {
        order.status = status
        order.timeline.push({ status, date: new Date() })
      }

      if (price !== undefined) order.price = Number(price)
      if (finalPrice !== undefined) order.finalPrice = Number(finalPrice)
      if (trackingNumber !== undefined) order.trackingNumber = trackingNumber
      if (trackingLink !== undefined) order.trackingLink = trackingLink

      await order.save()

      /* ================= STRIPE ================= */
      let checkoutUrl = null

      if (status === "payment_required") {
        try {
          const response = await fetch(
            `http://localhost:5050/api/stripe/create-checkout-session/${order._id}`,
            { method: "POST" }
          )

          const data = await response.json()
          checkoutUrl = data?.url || null

        } catch (err) {
          console.error("⚠️ Stripe failed:", err.message)
        }
      }

      /* ================= EMAIL ================= */
      if (order.email && ["payment_required", "paid", "shipped"].includes(status)) {
        try {
          await sendOrderStatusEmail(
            order.email,
            status,
            order._id,
            {
              ...order.toObject(),
              checkoutUrl
            }
          )
        } catch (err) {
          console.error("❌ EMAIL ERROR:", err)
        }
      }

      req.app.get("io")?.emit("jobUpdated")
      return res.json(order)
    }

    /* ================= QUOTE ================= */
    let quote = await Quote.findById(req.params.id)

    if (quote) {

      if (!quote.timeline) quote.timeline = []

      if (status) {
        quote.status = status
        quote.timeline.push({ status, date: new Date() })
      }

      if (price !== undefined) quote.price = Number(price)
      if (finalPrice !== undefined) quote.finalPrice = Number(finalPrice)

      await quote.save()

      if (status === "payment_required") {

        const newOrder = await Order.create({
          customerName: String(quote.customerName || "Unknown Customer").trim(),
          email: quote.email || "",
          quantity: Number(quote.quantity) || 1,
          printType: quote.printType || "screenprint",
          artwork: quote.artwork || null,

          price: Number(price) || 0,
          finalPrice: Number(finalPrice || price) || 0,

          items: [],

          source: "quote",
          status: "payment_required",

          timeline: [
            { status: "payment_required", date: new Date() }
          ]
        })

        req.app.get("io")?.emit("jobUpdated")
        return res.json(newOrder)
      }

      req.app.get("io")?.emit("jobUpdated")
      return res.json(quote)
    }

    return res.status(404).json({ message: "Not found" })

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SAVE INVOICE ================= */
router.patch("/:id/invoice", async (req, res) => {
  try {
    const { items, total } = req.body

    console.log("🧾 INVOICE REQUEST:", req.params.id)

    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (order.status === "paid") {
      return res.status(400).json({
        message: "Invoice locked after payment"
      })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Invoice must have items"
      })
    }

    const cleanItems = items.map(item => ({
      name: item.name || "",
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0
    }))

    order.items = cleanItems
    order.price = Number(total) || 0
    order.finalPrice = Number(total) || 0

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status: "invoice_updated",
      date: new Date(),
      note: "Invoice saved"
    })

    await order.save()

    console.log("✅ INVOICE SAVED:", order._id)

    req.app.get("io")?.emit("jobUpdated")

    res.json(order)

  } catch (err) {
    console.error("❌ INVOICE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
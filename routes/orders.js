import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { Parser } from "json2csv"

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

    res.status(201).json(newOrder)

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, price, finalPrice, trackingNumber, trackingLink } = req.body

    console.log("🔥 STATUS UPDATE:", req.params.id, status)

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

      if (order.email && ["payment_required", "paid", "shipped"].includes(status)) {
        await sendOrderStatusEmail(
          order.email,
          status,
          order._id,
          {
            ...order.toObject(),
            checkoutUrl
          }
        )
      }

      req.app.get("io")?.emit("jobUpdated")
      return res.json(order)
    }

    /* ================= QUOTE → ORDER ================= */
    let quote = await Quote.findById(req.params.id)

    if (quote) {

      console.log("🔄 CONVERTING QUOTE → ORDER")

      if (status === "payment_required") {

        if (!price || price <= 0) {
          return res.status(400).json({
            message: "Price required before sending payment"
          })
        }

        const newOrder = await Order.create({
          customerName: quote.customerName || "Unknown Customer",
          email: quote.email || "",
          quantity: quote.quantity || 1,
          printType: quote.printType || "screenprint",
          artwork: quote.artwork || null,

          price: Number(price),
          finalPrice: Number(finalPrice || price),

          items: quote.items || [],

          source: "quote",
          status: "payment_required",

          timeline: [
            { status: "payment_required", date: new Date(), note: "Converted from quote" }
          ]
        })

        /* 🔥 STRIPE */
        let checkoutUrl = null

        try {
          const response = await fetch(
            `http://localhost:5050/api/stripe/create-checkout-session/${newOrder._id}`,
            { method: "POST" }
          )

          const data = await response.json()
          checkoutUrl = data?.url || null

        } catch (err) {
          console.error("⚠️ Stripe failed:", err.message)
        }

        /* 🔥 EMAIL */
        if (newOrder.email) {
          await sendOrderStatusEmail(
            newOrder.email,
            "payment_required",
            newOrder._id,
            {
              ...newOrder.toObject(),
              checkoutUrl
            }
          )
        }

        /* 🔥 DELETE OLD QUOTE (optional but recommended) */
        await Quote.findByIdAndDelete(quote._id)

        req.app.get("io")?.emit("jobUpdated")

        return res.json(newOrder)
      }

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

    const order = await Order.findById(req.params.id)

    if (!order) return res.status(404).json({ message: "Order not found" })

    if (order.status === "paid") {
      return res.status(400).json({ message: "Invoice locked" })
    }

    const cleanItems = items.map(item => ({
      name: item.name || "",
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0
    }))

    order.items = cleanItems
    order.price = total
    order.finalPrice = total

    await order.save()

    req.app.get("io")?.emit("jobUpdated")

    res.json(order)

  } catch (err) {
    console.error("❌ INVOICE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= AUTO ARCHIVE ================= */
router.patch("/auto-archive", async (req, res) => {
  try {
    const days = Number(req.body.days || 7)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const result = await Order.updateMany(
      {
        status: "shipped",
        updatedAt: { $lt: cutoff }
      },
      {
        $set: { status: "archive" }
      }
    )

    res.json({ archived: result.modifiedCount })

  } catch (err) {
    console.error("❌ AUTO ARCHIVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SALES ================= */
router.get("/sales", async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $in: ["paid", "shipped"] }
    })

    const totalRevenue = orders.reduce((sum, o) => sum + (o.finalPrice || 0), 0)

    res.json({
      totalRevenue,
      totalOrders: orders.length
    })

  } catch (err) {
    console.error("❌ SALES ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= EXPORT ================= */
router.get("/export", async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $in: ["paid", "shipped"] }
    }).lean()

    const parser = new Parser({
      fields: ["customerName", "email", "finalPrice", "status", "createdAt"]
    })

    const csv = parser.parse(orders)

    res.header("Content-Type", "text/csv")
    res.attachment("sales.csv")
    res.send(csv)

  } catch (err) {
    console.error("❌ EXPORT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
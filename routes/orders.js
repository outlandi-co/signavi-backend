import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"

const router = express.Router()

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
      printStatus: "pending",
      timeline: [
        {
          status: "created",
          date: new Date(),
          note: "Order created"
        }
      ]
    })

    console.log("✅ ORDER CREATED:", order._id)

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💰 MARK PAID → PRODUCTION
========================================================= */
router.patch("/:id/mark-paid", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.status = "production"
    order.printStatus = "queued"

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status: "paid",
      date: new Date(),
      note: "Payment received → moved to production"
    })

    await order.save()

    console.log("🔥 ORDER MOVED TO PRODUCTION:", order._id)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ MARK PAID ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🖨️ PRINT CONTROL
========================================================= */
router.patch("/:id/print", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.printStatus = "printing"

    order.timeline.push({
      status: "printing",
      date: new Date(),
      note: "Printing started"
    })

    await order.save()

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ PRINT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

router.patch("/:id/print-complete", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    order.printStatus = "done"
    order.status = "completed"

    order.timeline.push({
      status: "completed",
      date: new Date(),
      note: "Print completed"
    })

    await order.save()

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ PRINT COMPLETE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   🧾 INVOICE
========================================================= */
router.get("/:id/invoice", async (req, res) => {
  const { id } = req.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).send("Invalid order ID")
  }

  try {
    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).send("Order not found")
    }

    const html = `
      <html>
        <head>
          <title>Invoice #${order._id}</title>
          <style>
            body { font-family: Arial; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 8px; }
          </style>
        </head>
        <body>

          <h1>Signavi Studio Invoice</h1>

          <p><b>Order ID:</b> ${order._id}</p>
          <p><b>Customer:</b> ${order.customerName}</p>
          <p><b>Email:</b> ${order.email}</p>

          <table>
            <tr>
              <th>Name</th>
              <th>Qty</th>
              <th>Price</th>
            </tr>

            ${order.items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>$${item.price}</td>
              </tr>
            `).join("")}
          </table>

          <h2>Total: $${order.finalPrice}</h2>

        </body>
      </html>
    `

    res.send(html)

  } catch (err) {
    console.error("❌ INVOICE ERROR:", err)
    res.status(500).send("Server error")
  }
})

/* =========================================================
   📦 GET ALL ORDERS
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
   📄 GET SINGLE ORDER
========================================================= */
router.get("/:id", async (req, res) => {
  const { id } = req.params

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

export default router
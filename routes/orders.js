import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import fetch from "node-fetch"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { generateInvoice } from "../utils/generateInvoice.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* ================= SOCKET ================= */

const emitOrderUpdate = (req, order) => {
  const io = req.app.get("io")
  if (io) {
    io.emit("jobUpdated", order)
  }
}

/* ================= GET ALL ================= */

router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })
    res.json({ success: true, data: orders })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET CUSTOMER ORDERS ================= */

router.get("/my-orders", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase()

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      })
    }

    const orders = await Order.find({
      email: { $regex: `^${email}$`, $options: "i" }
    }).sort({ createdAt: -1 })

    console.log("📧 MY ORDERS EMAIL:", email)
    console.log("📦 MY ORDERS FOUND:", orders.length)

    res.json({
      success: true,
      data: orders
    })

  } catch (err) {
    console.error("❌ MY ORDERS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= PACKING SLIP ================= */

router.get("/:id/packing-slip", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).send("Order not found")
    }

    const address = order.address || {}

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Packing Slip</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              color: #111;
            }

            h1 {
              margin-bottom: 5px;
            }

            .section {
              margin-top: 25px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }

            th, td {
              border: 1px solid #ccc;
              padding: 10px;
              text-align: left;
            }

            th {
              background: #f2f2f2;
            }

            .print-btn {
              margin-bottom: 20px;
              padding: 10px 14px;
              cursor: pointer;
            }

            @media print {
              .print-btn {
                display: none;
              }
            }
          </style>
        </head>

        <body>
          <button class="print-btn" onclick="window.print()">
            Print Packing Slip
          </button>

          <h1>SignaVi Studio</h1>

          <p><strong>Packing Slip</strong></p>
          <p>Order #${order._id.toString().slice(-6)}</p>

          <div class="section">
            <h2>Customer</h2>
            <p>${order.customerName || "Customer"}</p>
            <p>${order.email || ""}</p>
            <p>${order.phone || ""}</p>
          </div>

          <div class="section">
            <h2>Ship To</h2>
            <p>${address.street || ""}</p>
            <p>${address.city || ""}, ${address.state || ""} ${address.zip || ""}</p>
            <p>${address.country || "US"}</p>
          </div>

          <div class="section">
            <h2>Items</h2>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Variant</th>
                  <th>Qty</th>
                </tr>
              </thead>

              <tbody>
                ${(order.items || []).map(item => `
                  <tr>
                    <td>${item.name || "Item"}</td>
                    <td>${item.variant?.color || "-"} / ${item.variant?.size || "-"}</td>
                    <td>${item.quantity || 1}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `

    res.setHeader("Content-Type", "text/html")
    res.send(html)

  } catch (err) {
    console.error("❌ PACKING SLIP ERROR:", err)
    res.status(500).send("Packing slip failed")
  }
})

/* ================= PRINT ALL ================= */

router.get("/:id/print-all", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    const baseUrl =
      process.env.SERVER_URL ||
      "https://signavi-backend.onrender.com"

    res.json({
      success: true,
      label: order.trackingLabelUrl || "",
      packingSlip: `${baseUrl}/api/orders/${order._id}/packing-slip`,
      invoice: `${baseUrl}/api/orders/${order._id}/invoice`
    })

  } catch (err) {
    console.error("❌ PRINT ALL ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= DOWNLOAD INVOICE ================= */

router.get("/:id/invoice", async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      })
    }

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    const invoicePath = await generateInvoice(order)
    const fileName = `signavi-invoice-${order._id.toString().slice(-6)}.pdf`

    res.download(invoicePath, fileName)

  } catch (err) {
    console.error("❌ INVOICE DOWNLOAD ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to download invoice",
      error: err.message
    })
  }
})

/* ================= EMAIL INVOICE ================= */

router.post("/:id/send-invoice", async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      })
    }

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    const invoicePath = await generateInvoice(order)

    await sendOrderStatusEmail(
      order.email,
      "invoice",
      order,
      invoicePath
    )

    res.json({
      success: true,
      message: "Invoice sent successfully"
    })

  } catch (err) {
    console.error("❌ SEND INVOICE ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to send invoice",
      error: err.message
    })
  }
})

/* ================= GET SINGLE ORDER ================= */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      })
    }

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    res.json({
      success: true,
      data: order
    })

  } catch (err) {
    console.error("❌ GET ORDER BY ID ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
      error: err.message
    })
  }
})

/* ================= CREATE ================= */

router.post("/", async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      address,
      items
    } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Customer email is required"
      })
    }

    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: "No items provided"
      })
    }

    const safeItems = items.map(item => {
      const rawPrice =
        item.price ??
        item.selectedVariant?.price ??
        0

      const price = Number(rawPrice)

      console.log("🛒 ORDER ITEM:", {
        name: item.name,
        rawPrice,
        parsedPrice: price
      })

      if (isNaN(price)) {
        throw new Error(
          `Invalid item price for ${item.name || "item"}`
        )
      }

      return {
        name: item.name || "",
        quantity: Number(item.quantity || 1),
        price,
        cost: Number(item.cost || 0),
        variant: item.variant || item.selectedVariant || {}
      }
    })

    const subtotal = safeItems.reduce(
      (sum, item) => sum + (item.price * item.quantity),
      0
    )

    const tax = subtotal * 0.0825
    const finalPrice = subtotal + tax

    const order = await Order.create({
      customerName: String(customerName || "Customer").trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone || "").trim(),

      address: {
        street: address?.street || "",
        city: address?.city || "",
        state: address?.state || "",
        zip: address?.zip || "",
        country: address?.country || "US"
      },

      items: safeItems,
      subtotal,
      tax,
      finalPrice,
      status: "payment_required",
      source: "store"
    })

    const io = req.app.get("io")
    if (io) io.emit("jobCreated", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ ORDER CREATE ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= UPDATE ================= */

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const {
      status,
      finalPrice,
      note,
      customerName,
      email,
      phone,
      address
    } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    const order = await Order.findById(id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    if (!order.timeline) order.timeline = []

    if (customerName !== undefined) {
      order.customerName = String(customerName).trim()
    }

    if (email !== undefined) {
      order.email = String(email || "").trim().toLowerCase()
    }

    if (phone !== undefined) {
      order.phone = String(phone || "").trim()
    }

    if (address !== undefined) {
      order.address = {
        street: address?.street || order.address?.street || "",
        city: address?.city || order.address?.city || "",
        state: address?.state || order.address?.state || "",
        zip: address?.zip || order.address?.zip || "",
        country: address?.country || order.address?.country || "US"
      }
    }

    if (finalPrice !== undefined) {
      const parsed = Number(finalPrice)
      if (!isNaN(parsed) && parsed > 0) {
        order.finalPrice = parsed
      }
    }

    if (status) {
      const validStatuses = [
        "quotes",
        "payment_required",
        "ready_for_production",
        "paid",
        "production",
        "shipping",
        "shipped",
        "delivered",
        "archive",
        "denied"
      ]

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" })
      }

      order.status = status

      order.timeline.push({
        status,
        note: note || "",
        date: new Date()
      })
    }

    await order.save()

    emitOrderUpdate(req, order)

    try {
      await sendOrderStatusEmail(order.email, order.status, order)
    } catch (err) {
      console.warn("⚠️ Email failed:", err.message)
    }

    if (status === "payment_required" || status === "shipped") {
      try {
        const invoicePath = await generateInvoice(order)

        await sendOrderStatusEmail(
          order.email,
          "invoice",
          order,
          invoicePath
        )
      } catch (err) {
        console.warn("⚠️ Invoice generation failed:", err.message)
      }
    }

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ UPDATE ORDER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CHECKOUT ================= */

router.patch("/:id/checkout", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    const baseUrl = "https://signavi-backend.onrender.com"

    const response = await fetch(
      `${baseUrl}/api/square/create-payment/${order._id}`,
      { method: "POST" }
    )

    const data = await response.json()

    const paymentUrl =
      data?.paymentUrl ||
      data?.checkoutUrl ||
      data?.url

    if (!paymentUrl) {
      return res.status(500).json({ message: "Payment failed" })
    }

    order.paymentUrl = paymentUrl
    order.status = "payment_required"

    await order.save()
    emitOrderUpdate(req, order)

    await sendOrderStatusEmail(order.email, "payment_required", order)

    res.json({
      success: true,
      paymentUrl,
      orderId: order._id.toString()
    })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SHIP ================= */

router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: "Order not found" })

    order.status = "shipped"

    if (!order.timeline) order.timeline = []

    order.timeline.push({
      status: "shipped",
      date: new Date()
    })

    await order.save()
    emitOrderUpdate(req, order)

    await sendOrderStatusEmail(order.email, "shipped", order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
import express from "express"
import axios from "axios"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= CREATE ORDER ================= */
router.post("/", async (req, res) => {
  try {
    console.log("📦 INCOMING ORDER:", JSON.stringify(req.body, null, 2))

    const {
      customerName,
      email,
      items = [],
      shippingAddress,
      shippingCost = 0,
      shippingRateId = "",
      carrier = "",
      serviceLevel = ""
    } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items are required" })
    }

    /* 🔥 ENFORCE VALID ITEM PRICES */
    const cleanItems = items.map(item => {
      const price = Number(item.price)

      if (!price || price <= 0) {
        console.error("❌ INVALID ITEM:", item)
        throw new Error(`Invalid price for ${item.name}`)
      }

      return {
        productId: item.productId || item._id || item.id || null,
        name: item.name || "Item",
        quantity: Number(item.quantity || 1),
        price,
        variant: {
          color: (item?.variant?.color || "standard").toLowerCase(),
          size: (item?.variant?.size || "M").toUpperCase()
        }
      }
    })

    /* ================= CALCULATE TOTAL ================= */
    const subtotal = cleanItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    const TAX_RATE = 0.0825
    const tax = subtotal * TAX_RATE

    const finalPrice =
      subtotal +
      tax +
      Number(shippingCost || 0)

    const order = new Order({
      customerName: customerName || "Guest",
      email,
      items: cleanItems,
      quantity: cleanItems.reduce((s, i) => s + i.quantity, 0),

      subtotal,
      tax,
      price: subtotal,
      finalPrice,

      shippingAddress,
      shippingCost,
      shippingRateId,
      carrier,
      serviceLevel,

      status: "payment_required",
      source: "store",

      timeline: [
        {
          status: "payment_required",
          note: "Order created, awaiting payment"
        }
      ]
    })

    await order.save()

    console.log("💰 ORDER TOTAL:", finalPrice)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err.message)
    res.status(500).json({ message: err.message })
  }
})

/* ================= CHECKOUT ================= */
router.patch("/:id/checkout", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const {
      shippingAddress,
      shippingCost,
      shippingRateId,
      carrier,
      serviceLevel
    } = req.body

    order.shippingAddress = shippingAddress
    order.shippingCost = Number(shippingCost || 0)
    order.shippingRateId = shippingRateId
    order.carrier = carrier
    order.serviceLevel = serviceLevel

    /* 🔥 RECALCULATE TOTAL */
    const subtotal = Number(order.subtotal || order.price || 0)
    const TAX_RATE = 0.0825
    const tax = subtotal * TAX_RATE

    const finalPrice = subtotal + tax + order.shippingCost

    order.tax = tax
    order.finalPrice = finalPrice

    console.log("💰 UPDATED FINAL PRICE:", finalPrice)

    await order.save()

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ CHECKOUT ERROR:", err)
    res.status(500).json({ message: "Checkout failed" })
  }
})

/* ================= SHIP ORDER ================= */
router.post("/ship/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const shipRes = await axios.post(
      `${process.env.BASE_URL}/api/shipping/create-shipment`,
      {
        address_to: order.shippingAddress,
        rate_id: order.shippingRateId
      }
    )

    order.trackingNumber = shipRes.data.trackingNumber
    order.trackingLink = shipRes.data.trackingLink
    order.shippingLabel = shipRes.data.labelUrl
    order.status = "shipped"

    await order.save()

    await sendOrderStatusEmail(order.email, "shipped", order._id, order)

    res.json({ success: true, data: order })

  } catch (err) {
    console.error("❌ SHIP ERROR:", err)
    res.status(500).json({ message: "Shipping failed" })
  }
})

export default router
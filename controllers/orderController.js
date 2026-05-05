import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendOrderStatusEmail.js"

/* ================= CREATE ORDER ================= */
export const createOrder = async (req, res) => {
  try {
    const order = new Order(req.body)
    await order.save()

    /* 🔥 EMIT TO BOARD */
    if (req.io) {
      req.io.emit("jobCreated", order)
    }

    res.status(201).json({
      success: true,
      data: order
    })
  } catch (err) {
    console.error("❌ CREATE ORDER ERROR:", err)
    res.status(500).json({
      success: false,
      message: "Failed to create order"
    })
  }
}

/* ================= GET ALL ================= */
export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: orders
    })
  } catch (err) {
    console.error("❌ GET ORDERS ERROR:", err)
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders"
    })
  }
}

/* ================= GET ONE ================= */
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

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
    console.error("❌ GET ORDER ERROR:", err)
    res.status(500).json({
      success: false,
      message: "Server error"
    })
  }
}

/* ================= UPDATE (🔥 THIS IS THE KEY FIX) ================= */
export const updateOrder = async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    /* ================= EMAIL TRIGGERS ================= */
    if (updated.email && req.body.status) {
      await sendOrderStatusEmail(
        updated.email,
        req.body.status,
        updated
      )
    }

    /* ================= SOCKET UPDATE ================= */
    if (req.io) {
      req.io.emit("jobUpdated", updated)
    }

    res.json({
      success: true,
      data: updated
    })
  } catch (err) {
    console.error("❌ UPDATE ORDER ERROR:", err)
    res.status(500).json({
      success: false,
      message: "Failed to update order"
    })
  }
}

/* ================= SEND INVOICE ================= */
export const sendInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    /* 📧 SEND INVOICE EMAIL */
    await sendOrderStatusEmail(
      order.email,
      "invoice",
      order
    )

    res.json({
      success: true,
      message: "Invoice sent"
    })
  } catch (err) {
    console.error("❌ INVOICE ERROR:", err)
    res.status(500).json({
      success: false,
      message: "Invoice failed"
    })
  }
}

/* ================= DELETE ================= */
export const deleteOrder = async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id)

    res.json({
      success: true,
      message: "Order deleted"
    })
  } catch (err) {
    console.error("❌ DELETE ERROR:", err)
    res.status(500).json({
      success: false,
      message: "Delete failed"
    })
  }
}
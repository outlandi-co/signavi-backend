import express from "express"

import Order from "../models/Order.js"

import {
  sendOrderStatusEmail
} from "../utils/emailService.js"

const router = express.Router()

/* =========================================================
   HELPERS
========================================================= */

const addTimeline = (
  order,
  status,
  note
) => {

  if (!order.timeline) {
    order.timeline = []
  }

  order.timeline.push({
    status,
    date: new Date(),
    note
  })
}

/* =========================================================
   UPDATE STATUS
========================================================= */

router.patch("/:id/status", async (req, res) => {

  try {

    const { status } = req.body

    const order = await Order.findById(req.params.id)

    if (!order) {

      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    order.status = status

    if (status === "production") {
      order.customQuotePaidAt =
        order.customQuotePaidAt || new Date()
    }

    if (status === "shipping") {
      order.shippingStartedAt = new Date()
    }

    if (status === "shipped") {
      order.shippedAt = new Date()
    }

    if (status === "delivered") {
      order.deliveredAt = new Date()
    }

    if (status === "archive") {
      order.archivedAt = new Date()
    }

    addTimeline(
      order,
      status,
      `Admin updated order status to ${status}`
    )

    await order.save()

    /* ================= EMAIL TRIGGERS ================= */

    if (
      [
        "production",
        "shipping",
        "shipped",
        "delivered"
      ].includes(status)
    ) {

      await sendOrderStatusEmail(
        order.email,
        status,
        order
      )
    }

    return res.json({
      success: true,
      message: "Order updated",
      data: order
    })

  } catch (err) {

    console.error(
      "❌ UPDATE STATUS ERROR:",
      err
    )

    return res.status(500).json({
      success: false,
      message: "Failed to update order"
    })
  }
})

/* =========================================================
   COMPLETE ORDER
========================================================= */

router.patch("/:id/complete", async (req, res) => {

  try {

    const order = await Order.findById(req.params.id)

    if (!order) {

      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    order.status = "delivered"
    order.deliveredAt = new Date()

    addTimeline(
      order,
      "delivered",
      "Admin marked order completed"
    )

    await order.save()

    await sendOrderStatusEmail(
      order.email,
      "delivered",
      order
    )

    return res.json({
      success: true,
      message: "Order completed",
      data: order
    })

  } catch (err) {

    console.error(
      "❌ COMPLETE ORDER ERROR:",
      err
    )

    return res.status(500).json({
      success: false,
      message: "Failed to complete order"
    })
  }
})

/* =========================================================
   ARCHIVE ORDER
========================================================= */

router.patch("/:id/archive", async (req, res) => {

  try {

    const order = await Order.findById(req.params.id)

    if (!order) {

      return res.status(404).json({
        success: false,
        message: "Order not found"
      })
    }

    order.status = "archive"
    order.archivedAt = new Date()

    addTimeline(
      order,
      "archive",
      "Admin archived order"
    )

    await order.save()

    return res.json({
      success: true,
      message: "Order archived",
      data: order
    })

  } catch (err) {

    console.error(
      "❌ ARCHIVE ORDER ERROR:",
      err
    )

    return res.status(500).json({
      success: false,
      message: "Failed to archive order"
    })
  }
})

export default router
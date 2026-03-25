import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= STATUS UPDATE ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, trackingNumber, trackingLink } = req.body

    let order = await Order.findById(req.params.id)

    if (!order) {
      const quote = await Quote.findById(req.params.id)
      if (!quote) return res.status(404).json({ message: "Not found" })

      const updatedQuote = await Quote.findByIdAndUpdate(
        req.params.id,
        {
          status,
          trackingNumber,
          trackingLink,
          $push: { timeline: { status, date: new Date() } }
        },
        { returnDocument: "after" }
      )

      if (updatedQuote?.email) {
        await sendOrderStatusEmail(
          updatedQuote.email,
          status,
          updatedQuote._id,
          updatedQuote
        )
      }

      req.app.get("io")?.emit("jobUpdated")
      return res.json(updatedQuote)
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status,
        trackingNumber,
        trackingLink,
        $push: { timeline: { status, date: new Date() } }
      },
      { returnDocument: "after" }
    )

    if (updatedOrder?.email) {
      await sendOrderStatusEmail(
        updatedOrder.email,
        status,
        updatedOrder._id,
        updatedOrder
      )
    }

    req.app.get("io")?.emit("jobUpdated")

    res.json(updatedOrder)

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= APPROVE VIA EMAIL ================= */
router.get("/approve/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) return res.status(404).send("Order not found")

    order.status = "paid"
    order.timeline.push({ status: "paid", date: new Date() })

    await order.save()

    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "paid",
        order._id,
        order
      )
    }

    req.app.get("io")?.emit("jobUpdated")

    res.send(`
      <div style="text-align:center;margin-top:50px;font-family:Arial;">
        <h1>✅ Payment Confirmed</h1>
        <p>Your order has been processed.</p>
      </div>
    `)

  } catch (err) {
    console.error("❌ APPROVE ROUTE ERROR:", err)
    res.status(500).send("Server error")
  }
})

export default router
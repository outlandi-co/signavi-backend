 import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= VALID STATUSES ================= */
const validStatuses = [
  "pending",
  "approved",
  "artwork_sent",
  "printing",
  "ready",
  "shipping",
  "shipped",
  "denied"
]

/* ================= UPDATE STATUS ================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, trackingNumber, trackingLink } = req.body

    console.log("🔥 STATUS UPDATE:", req.params.id, status)

    /* 🔥 VALIDATE STATUS */
    if (!validStatuses.includes(status)) {
      console.warn("⚠️ Invalid status:", status)
      return res.status(400).json({ message: "Invalid status" })
    }

    let order = await Order.findById(req.params.id)

    /* ================= IF NOT ORDER → CHECK QUOTE ================= */
    if (!order) {
      const quote = await Quote.findById(req.params.id)

      if (!quote) {
        return res.status(404).json({ message: "Not found anywhere" })
      }

      const updatedQuote = await Quote.findByIdAndUpdate(
        req.params.id,
        {
          status,
          trackingNumber,
          trackingLink,
          $push: {
            timeline: {
              status,
              date: new Date()
            }
          }
        },
        { returnDocument: "after" }
      )

      if (updatedQuote?.email) {
        await sendOrderStatusEmail(
          updatedQuote.email,
          status,
          updatedQuote._id,
          null,
          trackingNumber
        )
      }

      req.app.get("io")?.emit("jobUpdated")

      console.log("✅ QUOTE STATUS UPDATED:", updatedQuote?._id)

      return res.json(updatedQuote)
    }

    /* ================= UPDATE ORDER ================= */
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status,
        trackingNumber,
        trackingLink,
        $push: {
          timeline: {
            status,
            date: new Date()
          }
        }
      },
      { returnDocument: "after" }
    )

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" })
    }

    if (updatedOrder?.email) {
      await sendOrderStatusEmail(
        updatedOrder.email,
        status,
        updatedOrder._id,
        null,
        trackingNumber
      )
    }

    req.app.get("io")?.emit("jobUpdated")

    console.log("✅ ORDER STATUS UPDATED:", updatedOrder._id)

    res.json(updatedOrder)

  } catch (err) {
    console.error("❌ STATUS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router
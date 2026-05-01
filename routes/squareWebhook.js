import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

/* =========================================================
   🔥 SQUARE WEBHOOK HANDLER
========================================================= */
router.post("/webhook", async (req, res) => {
  try {
    const event = req.body

    console.log("📥 WEBHOOK RECEIVED:", event?.type)

    /* ================= PAYMENT COMPLETED ================= */
    if (event?.type === "payment.created") {

      const payment = event?.data?.object?.payment

      const note = payment?.note || ""
      const orderId = note.replace("ID:", "").trim()

      console.log("🔎 Extracted ID:", orderId)

      let record = await Quote.findById(orderId)

      if (!record) {
        record = await Order.findById(orderId)
      }

      if (!record) {
        console.warn("⚠️ No record found for webhook ID")
        return res.sendStatus(200)
      }

      /* ================= UPDATE STATUS ================= */
      record.status = "paid"

      record.timeline.push({
        status: "paid",
        note: "Payment received",
        date: new Date()
      })

      await record.save()

      console.log("✅ MARKED AS PAID:", record._id)
    }

    res.sendStatus(200)

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err)
    res.sendStatus(500)
  }
})

export default router
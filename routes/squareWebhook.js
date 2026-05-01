import express from "express"
import crypto from "crypto"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"

const router = express.Router()

// 🔥 IMPORTANT: use raw body for signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-square-signature"]
      const body = req.body // raw buffer
      const webhookUrl = process.env.SQUARE_WEBHOOK_URL
      const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY

      // ================= VERIFY SIGNATURE =================
      const hmac = crypto.createHmac("sha256", signatureKey)
      hmac.update(webhookUrl + body)
      const expectedSignature = hmac.digest("base64")

      if (signature !== expectedSignature) {
        console.log("❌ Invalid webhook signature")
        return res.status(401).send("Invalid signature")
      }

      const payload = JSON.parse(body.toString())

      console.log("📩 WEBHOOK RECEIVED:", payload.type)

      // ================= HANDLE PAYMENT SUCCESS =================
      if (payload.type === "payment.created") {
        const payment = payload.data?.object?.payment

        if (!payment) return res.sendStatus(200)

        const note = payment.note || ""

        // 🔥 Extract ID from note: "ID:xxxx"
        const match = note.match(/ID:(\w+)/)

        if (!match) {
          console.log("⚠️ No ID found in note")
          return res.sendStatus(200)
        }

        const recordId = match[1]

        console.log("🔍 MATCHING RECORD:", recordId)

        // Try to find order first
        let order = await Order.findById(recordId)

        // If not found, try quote → order
        if (!order) {
          const quote = await Quote.findById(recordId)

          if (quote) {
            order = await Order.findOne({ quoteId: quote._id })
          }
        }

        if (!order) {
          console.log("❌ No matching order found")
          return res.sendStatus(200)
        }

        // ================= UPDATE ORDER =================
        if (order.status !== "production") {
          order.status = "production"
          order.printStatus = "queued"

          if (!order.timeline) order.timeline = []

          order.timeline.push({
            status: "paid",
            date: new Date(),
            note: "Webhook: payment received → production"
          })

          await order.save()

          console.log("🔥 ORDER AUTO-MOVED TO PRODUCTION:", order._id)
        } else {
          console.log("⚠️ Order already in production")
        }
      }

      res.sendStatus(200)

    } catch (err) {
      console.error("❌ WEBHOOK ERROR:", err)
      res.sendStatus(500)
    }
  }
)

export default router
import express from "express"
import crypto from "crypto"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import sendReceiptEmail from "../utils/sendReceiptEmail.js"

const router = express.Router()

// 🔥 IMPORTANT: use raw body for Square signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-square-signature"]
      const body = req.body
      const webhookUrl = process.env.SQUARE_WEBHOOK_URL
      const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY

      if (!signature || !webhookUrl || !signatureKey) {
        console.log("❌ Missing Square webhook signature config")
        return res.status(401).send("Missing webhook signature config")
      }

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
      if (
        payload.type !== "payment.created" &&
        payload.type !== "payment.updated"
      ) {
        return res.sendStatus(200)
      }

      const payment = payload.data?.object?.payment

      if (!payment) {
        console.log("⚠️ No payment object found")
        return res.sendStatus(200)
      }

      if (payment.status !== "COMPLETED") {
        console.log("⚠️ Payment not completed yet:", payment.status)
        return res.sendStatus(200)
      }

      const note = payment.note || ""

      // 🔥 Extract Mongo ObjectId from note: "ID:xxxxxxxxxxxxxxxxxxxxxxxx"
      const match = note.match(/ID:([a-fA-F0-9]{24})/)

      if (!match) {
        console.log("⚠️ No Mongo ID found in payment note")
        return res.sendStatus(200)
      }

      const recordId = match[1]

      console.log("🔍 MATCHING RECORD:", recordId)

      // Try order first
      let order = await Order.findById(recordId)

      // If record ID belongs to quote, find order connected to quote
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

      const wasAlreadyPaid =
        order.paymentStatus === "paid" ||
        order.paidAt ||
        order.status === "production"

      // ================= UPDATE ORDER AS PAID =================
      order.paymentStatus = "paid"
      order.paymentMethod = "Square"
      order.squarePaymentId = payment.id || order.squarePaymentId
      order.paidAt = order.paidAt || new Date()
      order.customQuotePaidAt = order.customQuotePaidAt || new Date()

      // Move into production automatically
      order.status = "production"
      order.printStatus = "queued"

      if (!order.timeline) order.timeline = []

      if (!wasAlreadyPaid) {
        order.timeline.push({
          status: "paid",
          date: new Date(),
          note: "Webhook: payment received"
        })

        order.timeline.push({
          status: "production",
          date: new Date(),
          note: "Webhook: payment received → production"
        })
      }

      await order.save()

      console.log("🔥 ORDER MARKED PAID + AUTO-MOVED TO PRODUCTION:", order._id)

      // ================= SEND RECEIPT EMAIL ONCE =================
      if (!order.receiptEmailSent) {
        await sendReceiptEmail(order)

        order.receiptEmailSent = true
        order.receiptEmailSentAt = new Date()
        order.receiptCreatedAt = order.receiptCreatedAt || new Date()

        await order.save()

        console.log("📧 RECEIPT EMAIL SENT:", order.email)
      } else {
        console.log("⚠️ Receipt email already sent:", order.email)
      }

      return res.sendStatus(200)

    } catch (err) {
      console.error("❌ WEBHOOK ERROR:", err)
      return res.sendStatus(500)
    }
  }
)

export default router
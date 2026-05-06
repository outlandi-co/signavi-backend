import express from "express"
import sgMail from "@sendgrid/mail"
import { requireAuth } from "../../middleware/requireAuth.js"

const router = express.Router()

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  console.log("📧 ADMIN EMAIL ROUTE READY")
} else {
  console.warn("⚠️ SENDGRID_API_KEY missing")
}

router.post("/send-email", requireAuth, async (req, res) => {
  try {
    const { to, subject, message } = req.body || {}

    if (!to || !subject || !message) {
      return res.status(400).json({
        message: "To, subject, and message are required"
      })
    }

    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL ||
      process.env.EMAIL_FROM ||
      "admin@signavistudio.store"

    await sgMail.send({
      to,
      from: fromEmail,
      subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; color:#111;">
          <h2>SignaVi Studio</h2>
          <p>${message.replace(/\n/g, "<br/>")}</p>
        </div>
      `
    })

    console.log("📧 ADMIN EMAIL SENT:", to)

    res.json({
      success: true,
      message: "Email sent successfully"
    })

  } catch (err) {
    console.error("❌ ADMIN EMAIL ERROR:", err?.response?.body || err)

    res.status(500).json({
      message: "Failed to send email",
      error: err?.message
    })
  }
})

export default router
import express from "express"
import sgMail from "@sendgrid/mail"

import { requireAuth } from "../../middleware/requireAuth.js"

import EmailLog from "../../models/EmailLog.js"

const router = express.Router()

/* ================= SENDGRID ================= */

if (process.env.SENDGRID_API_KEY) {

  sgMail.setApiKey(
    process.env.SENDGRID_API_KEY
  )

  console.log(
    "📧 ADMIN EMAIL ROUTE READY"
  )

} else {

  console.warn(
    "⚠️ SENDGRID_API_KEY missing"
  )
}

/* ================= SEND EMAIL ================= */

router.post(
  "/send-email",

  requireAuth,

  async (req, res) => {

    try {

      const {
        to,
        cc,
        subject,
        message,
        customerId,
        customerName
      } = req.body || {}

      /* ================= VALIDATION ================= */

      if (
        !to ||
        !subject ||
        !message
      ) {

        return res.status(400).json({
          message:
            "To, subject, and message are required"
        })
      }

      /* ================= FROM EMAIL ================= */

      const fromEmail =

        process.env.SENDGRID_FROM_EMAIL ||

        process.env.EMAIL_FROM ||

        "admin@signavistudio.store"

      /* ================= SENDGRID ================= */

      await sgMail.send({

        to,

        cc: cc || undefined,

        from: fromEmail,

        subject,

        text: message,

        html: `
          <div
            style="
              font-family: Arial, sans-serif;
              color:#111;
              line-height:1.6;
            "
          >

            <h2>
              SignaVi Studio
            </h2>

            <p>
              ${message.replace(/\n/g, "<br/>")}
            </p>

          </div>
        `
      })

      /* ================= SAVE EMAIL LOG ================= */

      await EmailLog.create({

        to,

        cc: cc || "",

        subject,

        message,

        status: "sent",

        archived: false,

        sentBy: req.user?.id,

        adminEmail: req.user?.email || "",

        customerId:
          customerId || null,

        customerName:
          customerName || ""

      })

      console.log(
        "📧 ADMIN EMAIL SENT:",
        {
          to,
          cc,
          subject
        }
      )

      /* ================= RESPONSE ================= */

      res.json({

        success: true,

        message:
          "Email sent successfully"

      })

    } catch (err) {

      console.error(
        "❌ ADMIN EMAIL ERROR:",
        err?.response?.body || err
      )

      /* ================= SAVE FAILED LOG ================= */

      try {

        const {
          to,
          cc,
          subject,
          message,
          customerId,
          customerName
        } = req.body || {}

        await EmailLog.create({

          to: to || "",

          cc: cc || "",

          subject: subject || "",

          message: message || "",

          status: "failed",

          archived: false,

          sentBy: req.user?.id,

          adminEmail:
            req.user?.email || "",

          customerId:
            customerId || null,

          customerName:
            customerName || ""

        })

      } catch (logErr) {

        console.error(
          "❌ EMAIL LOG SAVE ERROR:",
          logErr
        )
      }

      res.status(500).json({

        message:
          "Failed to send email",

        error:
          err?.message ||

          "Unknown error"
      })
    }
  }
)

/* ================= GET EMAIL HISTORY ================= */

router.get(
  "/history",

  requireAuth,

  async (req, res) => {

    try {

      const emails =
        await EmailLog.find()

          .sort({ createdAt: -1 })

          .limit(100)

      res.json({
        success: true,
        data: emails
      })

    } catch (err) {

      console.error(
        "❌ EMAIL HISTORY ERROR:",
        err
      )

      res.status(500).json({
        message:
          "Failed to load email history"
      })
    }
  }
)

/* ================= ARCHIVE EMAIL ================= */

router.patch(
  "/archive/:id",

  requireAuth,

  async (req, res) => {

    try {

      const email =
        await EmailLog.findByIdAndUpdate(

          req.params.id,

          {
            archived: true,
            status: "archived"
          },

          {
            new: true
          }
        )

      res.json({
        success: true,
        data: email
      })

    } catch (err) {

      console.error(
        "❌ EMAIL ARCHIVE ERROR:",
        err
      )

      res.status(500).json({
        message:
          "Failed to archive email"
      })
    }
  }
)

export default router
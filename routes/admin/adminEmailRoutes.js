import express from "express"
import multer from "multer"
import { Resend } from "resend"

import { requireAuth } from "../../middleware/requireAuth.js"
import AdminEmail from "../../models/AdminEmail.js"

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024
  }
})

/* ================= EMAIL CONFIG ================= */

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  "info@signavistudio.store"

const QUOTES_EMAIL =
  process.env.QUOTES_EMAIL ||
  "quotes@signavistudio.store"

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || ""

const resend =
  new Resend(RESEND_API_KEY)

if (RESEND_API_KEY) {
  console.log("📨 ADMIN EMAIL RESEND ROUTE READY")
} else {
  console.warn("⚠️ RESEND_API_KEY missing")
}

/* ================= HELPERS ================= */

const buildHtml = (message = "") => `
  <div style="
    font-family: Arial, sans-serif;
    color:#111;
    line-height:1.6;
  ">
    <h2>SignaVi Studio</h2>
    <p>
      ${String(message).replace(/\n/g, "<br/>")}
    </p>
  </div>
`

const getFromEmail = (channel = "info") => {
  return channel === "quotes"
    ? QUOTES_EMAIL
    : INFO_EMAIL
}

const splitEmails = (value = "") => {
  if (!value) return undefined

  const emails =
    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

  return emails.length
    ? emails
    : undefined
}

const mapResendAttachments = (files = []) => {
  return files.map((file) => ({
    filename:
      file.originalname,

    content:
      file.buffer
  }))
}

const mapAttachmentMeta = (files = []) => {
  return files.map((file) => ({
    fileName:
      file.originalname,

    mimeType:
      file.mimetype,

    size:
      file.size
  }))
}

const sendWithResend = async ({
  to,
  cc,
  bcc,
  fromEmail,
  subject,
  message,
  html,
  attachments = []
}) => {
  if (!RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not configured"
    )
  }

  const {
    data,
    error
  } = await resend.emails.send({
    from:
      `SignaVi Studio <${fromEmail}>`,

    to:
      splitEmails(to),

    cc:
      splitEmails(cc),

    bcc:
      splitEmails(bcc),

    subject,

    text:
      message,

    html,

    attachments:
      attachments.length
        ? attachments
        : undefined
  })

  if (error) {
    console.error(
      "❌ RESEND SEND ERROR:",
      error
    )

    throw new Error(
      error.message ||
      "Resend failed to send email"
    )
  }

  return data
}

/* ================= SEND EMAIL ================= */

router.post(
  "/send-email",
  requireAuth,
  upload.array("attachments", 5),
  async (req, res) => {
    try {
      const {
        to = "",
        cc = "",
        bcc = "",
        subject = "",
        message = "",
        channel = "info",
        customerId = null,
        customerName = ""
      } = req.body || {}

      if (
        !to ||
        !subject ||
        !message
      ) {
        return res.status(400).json({
          success: false,
          message:
            "To, subject, and message are required"
        })
      }

      const cleanChannel =
        channel === "quotes"
          ? "quotes"
          : "info"

      const fromEmail =
        getFromEmail(
          cleanChannel
        )

      const html =
        buildHtml(message)

      const attachments =
        mapResendAttachments(
          req.files || []
        )

      const attachmentMeta =
        mapAttachmentMeta(
          req.files || []
        )

      const resendResult =
        await sendWithResend({
          to,
          cc,
          bcc,
          fromEmail,
          subject,
          message,
          html,
          attachments
        })

      console.log(
        "✅ RESEND EMAIL SENT:",
        resendResult?.id
      )

      const email =
        await AdminEmail.create({
          to,
          cc,
          bcc,

          subject,

          message,

          html,

          attachments:
            attachmentMeta,

          status:
            "sent",

          archived:
            false,

          sentAt:
            new Date(),

          createdBy:
            fromEmail,

          customerId:
            customerId || null,

          customerName:
            customerName || ""
        })

      res.json({
        success: true,

        message:
          cleanChannel === "quotes"
            ? "Quote email sent successfully"
            : "Information email sent successfully",

        provider:
          "resend",

        resendId:
          resendResult?.id ||
          null,

        channel:
          cleanChannel,

        from:
          fromEmail,

        data:
          email
      })
    } catch (err) {
      console.error(
        "❌ ADMIN EMAIL ERROR:",
        err
      )

      try {
        const failedChannel =
          req.body?.channel ===
          "quotes"
            ? "quotes"
            : "info"

        const failedFromEmail =
          getFromEmail(
            failedChannel
          )

        await AdminEmail.create({
          to:
            req.body?.to ||
            "",

          cc:
            req.body?.cc ||
            "",

          bcc:
            req.body?.bcc ||
            "",

          subject:
            req.body?.subject ||
            "",

          message:
            req.body?.message ||
            "",

          status:
            "failed",

          archived:
            false,

          createdBy:
            failedFromEmail,

          customerId:
            req.body?.customerId ||
            null,

          customerName:
            req.body?.customerName ||
            ""
        })
      } catch (logErr) {
        console.error(
          "❌ EMAIL FAILED LOG ERROR:",
          logErr
        )
      }

      res.status(500).json({
        success: false,

        message:
          "Failed to send email",

        error:
          err?.message ||
          "Unknown error"
      })
    }
  }
)

/* ================= SAVE DRAFT ================= */

router.post(
  "/drafts",
  requireAuth,
  async (req, res) => {
    try {
      const {
        to = "",
        cc = "",
        bcc = "",
        subject = "",
        message = "",
        channel = "info",
        customerId = null,
        customerName = ""
      } = req.body || {}

      const cleanChannel =
        channel === "quotes"
          ? "quotes"
          : "info"

      const fromEmail =
        getFromEmail(
          cleanChannel
        )

      const draft =
        await AdminEmail.create({
          to,
          cc,
          bcc,

          subject,

          message,

          html:
            buildHtml(
              message
            ),

          status:
            "draft",

          archived:
            false,

          createdBy:
            fromEmail,

          customerId:
            customerId ||
            null,

          customerName:
            customerName ||
            ""
        })

      res
        .status(201)
        .json({
          success: true,

          channel:
            cleanChannel,

          from:
            fromEmail,

          data:
            draft
        })
    } catch (err) {
      console.error(
        "❌ SAVE DRAFT ERROR:",
        err
      )

      res.status(500).json({
        success: false,

        message:
          "Failed to save draft"
      })
    }
  }
)

/* ================= SEND DRAFT ================= */

router.patch(
  "/drafts/:id/send",
  requireAuth,
  async (req, res) => {
    try {
      const draft =
        await AdminEmail.findById(
          req.params.id
        )

      if (!draft) {
        return res.status(404).json({
          success: false,
          message:
            "Draft not found"
        })
      }

      if (
        !draft.to ||
        !draft.subject ||
        !draft.message
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Draft needs To, subject, and message before sending"
        })
      }

      const fromEmail =
        draft.createdBy ===
        QUOTES_EMAIL
          ? QUOTES_EMAIL
          : INFO_EMAIL

      const resendResult =
        await sendWithResend({
          to:
            draft.to,

          cc:
            draft.cc,

          bcc:
            draft.bcc,

          fromEmail,

          subject:
            draft.subject,

          message:
            draft.message,

          html:
            draft.html ||
            buildHtml(
              draft.message
            )
        })

      console.log(
        "✅ RESEND DRAFT SENT:",
        resendResult?.id
      )

      draft.status =
        "sent"

      draft.archived =
        false

      draft.sentAt =
        new Date()

      draft.createdBy =
        fromEmail

      await draft.save()

      res.json({
        success: true,

        provider:
          "resend",

        resendId:
          resendResult?.id ||
          null,

        from:
          fromEmail,

        data:
          draft
      })
    } catch (err) {
      console.error(
        "❌ SEND DRAFT ERROR:",
        err
      )

      res.status(500).json({
        success: false,

        message:
          "Failed to send draft",

        error:
          err?.message ||
          "Unknown error"
      })
    }
  }
)

/* ================= FOLDERS ================= */

router.get(
  "/folder/:folder",
  requireAuth,
  async (req, res) => {
    try {
      const {
        folder
      } = req.params

      const {
        channel
      } = req.query

      const query = {}

      if (
        folder === "sent"
      ) {
        query.status =
          "sent"

        query.archived =
          false
      }

      if (
        folder === "drafts"
      ) {
        query.status =
          "draft"

        query.archived =
          false
      }

      if (
        folder === "outbox"
      ) {
        query.status = {
          $in: [
            "queued",
            "failed"
          ]
        }

        query.archived =
          false
      }

      if (
        folder === "archive"
      ) {
        query.archived =
          true
      }

      if (
        folder === "all"
      ) {
        // no base filter
      }

      if (
        channel === "quotes"
      ) {
        query.createdBy =
          QUOTES_EMAIL
      }

      if (
        channel === "info"
      ) {
        query.createdBy =
          INFO_EMAIL
      }

      const emails =
        await AdminEmail.find(
          query
        )
          .sort({
            sentAt: -1,
            createdAt: -1
          })
          .limit(100)

      res.json({
        success: true,
        data: emails
      })
    } catch (err) {
      console.error(
        "❌ EMAIL FOLDER ERROR:",
        err
      )

      res.status(500).json({
        success: false,

        message:
          "Failed to load email folder"
      })
    }
  }
)

/* ================= SENT ================= */

router.get(
  "/sent",
  requireAuth,
  async (req, res) => {
    try {
      const {
        channel
      } = req.query

      const query = {
        status:
          "sent",

        archived:
          false
      }

      if (
        channel === "quotes"
      ) {
        query.createdBy =
          QUOTES_EMAIL
      }

      if (
        channel === "info"
      ) {
        query.createdBy =
          INFO_EMAIL
      }

      const emails =
        await AdminEmail.find(
          query
        )
          .sort({
            sentAt: -1,
            createdAt: -1
          })
          .limit(100)

      res.json({
        success: true,
        data: emails
      })
    } catch (err) {
      console.error(
        "❌ SENT EMAIL ERROR:",
        err
      )

      res.status(500).json({
        success: false,

        message:
          "Failed to load sent emails"
      })
    }
  }
)

/* ================= HISTORY ================= */

router.get(
  "/history",
  requireAuth,
  async (req, res) => {
    try {
      const {
        channel
      } = req.query

      const query = {}

      if (
        channel === "quotes"
      ) {
        query.createdBy =
          QUOTES_EMAIL
      }

      if (
        channel === "info"
      ) {
        query.createdBy =
          INFO_EMAIL
      }

      const emails =
        await AdminEmail.find(
          query
        )
          .sort({
            createdAt: -1
          })
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
        success: false,

        message:
          "Failed to load email history"
      })
    }
  }
)

/* ================= ARCHIVE ================= */

router.patch(
  "/archive/:id",
  requireAuth,
  async (req, res) => {
    try {
      const email =
        await AdminEmail.findByIdAndUpdate(
          req.params.id,
          {
            archived:
              true,

            status:
              "archived"
          },
          {
            returnDocument:
              "after"
          }
        )

      if (!email) {
        return res.status(404).json({
          success: false,
          message:
            "Email not found"
        })
      }

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
        success: false,

        message:
          "Failed to archive email"
      })
    }
  }
)

/* ================= RESTORE ================= */

router.patch(
  "/restore/:id",
  requireAuth,
  async (req, res) => {
    try {
      const email =
        await AdminEmail.findByIdAndUpdate(
          req.params.id,
          {
            archived:
              false,

            status:
              "sent"
          },
          {
            returnDocument:
              "after"
          }
        )

      if (!email) {
        return res.status(404).json({
          success: false,
          message:
            "Email not found"
        })
      }

      res.json({
        success: true,
        data: email
      })
    } catch (err) {
      console.error(
        "❌ EMAIL RESTORE ERROR:",
        err
      )

      res.status(500).json({
        success: false,

        message:
          "Failed to restore email"
      })
    }
  }
)

export default router
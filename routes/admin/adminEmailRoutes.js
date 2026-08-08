import express from "express"
import multer from "multer"
import sgMail from "@sendgrid/mail"

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

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ||
  "support@signavistudio.store"

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  "info@signavistudio.store"

const QUOTES_EMAIL =
  process.env.QUOTES_EMAIL ||
  "quotes@signavistudio.store"

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(
    process.env.SENDGRID_API_KEY
  )

  console.log(
    "📧 ADMIN EMAIL SENDGRID ROUTE READY"
  )
} else {
  console.warn(
    "⚠️ SENDGRID_API_KEY missing"
  )
}

/* ================= HELPERS ================= */

const buildHtml = (message = "") => `
  <div
    style="
      font-family: Arial, sans-serif;
      color:#111;
      line-height:1.6;
    "
  >
    <h2>SignaVi Studio</h2>

    <p>
      ${String(message).replace(/\n/g, "<br/>")}
    </p>
  </div>
`

const getFromEmail = (channel = "info") => {
  switch (channel) {
    case "support":
      return SUPPORT_EMAIL

    case "quotes":
      return QUOTES_EMAIL

    case "info":
    default:
      return INFO_EMAIL
  }
}

const getCleanChannel = (channel = "info") => {
  return [
    "info",
    "quotes",
    "support"
  ].includes(channel)
    ? channel
    : "info"
}

const splitEmails = (value = "") => {
  if (!value) {
    return undefined
  }

  const emails =
    String(value)
      .split(",")
      .map((item) =>
        item.trim()
      )
      .filter(Boolean)

  return emails.length
    ? emails
    : undefined
}

const mapSendGridAttachments = (
  files = []
) => {
  return files.map((file) => ({
    content:
      file.buffer.toString(
        "base64"
      ),

    filename:
      file.originalname,

    type:
      file.mimetype,

    disposition:
      "attachment"
  }))
}

const mapAttachmentMeta = (
  files = []
) => {
  return files.map((file) => ({
    fileName:
      file.originalname,

    mimeType:
      file.mimetype,

    size:
      file.size
  }))
}

const sendWithSendGrid = async ({
  to,
  cc,
  bcc,
  fromEmail,
  subject,
  message,
  html,
  attachments = []
}) => {
  if (
    !process.env
      .SENDGRID_API_KEY
  ) {
    throw new Error(
      "SENDGRID_API_KEY is not configured"
    )
  }

  await sgMail.send({
    to:
      splitEmails(to),

    cc:
      splitEmails(cc),

    bcc:
      splitEmails(bcc),

    from: {
      email:
        fromEmail,

      name:
        "SignaVi Studio"
    },

    subject,

    text:
      message,

    html,

    attachments:
      attachments.length
        ? attachments
        : undefined
  })

  return {
    success: true
  }
}

/* ================= SEND EMAIL ================= */

router.post(
  "/send-email",
  requireAuth,
  upload.array(
    "attachments",
    5
  ),
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
        return res
          .status(400)
          .json({
            success: false,

            message:
              "To, subject, and message are required"
          })
      }

      const cleanChannel =
        getCleanChannel(
          channel
        )

      const fromEmail =
        getFromEmail(
          cleanChannel
        )

      const html =
        buildHtml(
          message
        )

      const attachments =
        mapSendGridAttachments(
          req.files || []
        )

      const attachmentMeta =
        mapAttachmentMeta(
          req.files || []
        )

      await sendWithSendGrid({
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
        "✅ SENDGRID EMAIL SENT:",
        {
          to,
          from:
            fromEmail,
          channel:
            cleanChannel
        }
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
            customerId ||
            null,

          customerName:
            customerName ||
            ""
        })

      res.json({
        success: true,

        message:
          cleanChannel ===
          "quotes"
            ? "Quote email sent successfully"
            : cleanChannel ===
              "support"
              ? "Support email sent successfully"
              : "Information email sent successfully",

        provider:
          "sendgrid",

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
        err?.response?.body ||
          err
      )

      try {
        const failedChannel =
          getCleanChannel(
            req.body?.channel
          )

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
            req.body
              ?.subject ||
            "",

          message:
            req.body
              ?.message ||
            "",

          status:
            "failed",

          archived:
            false,

          createdBy:
            failedFromEmail,

          customerId:
            req.body
              ?.customerId ||
            null,

          customerName:
            req.body
              ?.customerName ||
            ""
        })
      } catch (logErr) {
        console.error(
          "❌ EMAIL FAILED LOG ERROR:",
          logErr
        )
      }

      res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to send email",

          error:
            err?.response
              ?.body
              ?.errors ||
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
        getCleanChannel(
          channel
        )

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

      res
        .status(500)
        .json({
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
        await AdminEmail
          .findById(
            req.params.id
          )

      if (!draft) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Draft not found"
          })
      }

      if (
        !draft.to ||
        !draft.subject ||
        !draft.message
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Draft needs To, subject, and message before sending"
          })
      }

      let fromEmail =
        INFO_EMAIL

      if (
        draft.createdBy ===
        QUOTES_EMAIL
      ) {
        fromEmail =
          QUOTES_EMAIL
      }

      if (
        draft.createdBy ===
        SUPPORT_EMAIL
      ) {
        fromEmail =
          SUPPORT_EMAIL
      }

      await sendWithSendGrid({
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
        "✅ SENDGRID DRAFT SENT:",
        {
          to:
            draft.to,

          from:
            fromEmail
        }
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
          "sendgrid",

        from:
          fromEmail,

        data:
          draft
      })
    } catch (err) {
      console.error(
        "❌ SEND DRAFT ERROR:",
        err?.response?.body ||
          err
      )

      res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to send draft",

          error:
            err?.response
              ?.body
              ?.errors ||
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
        folder ===
        "drafts"
      ) {
        query.status =
          "draft"

        query.archived =
          false
      }

      if (
        folder ===
        "outbox"
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
        folder ===
        "archive"
      ) {
        query.archived =
          true
      }

      if (
        folder === "all"
      ) {
        // No base filter
      }

      if (
        channel ===
        "quotes"
      ) {
        query.createdBy =
          QUOTES_EMAIL
      }

      if (
        channel ===
        "info"
      ) {
        query.createdBy =
          INFO_EMAIL
      }

      if (
        channel ===
        "support"
      ) {
        query.createdBy =
          SUPPORT_EMAIL
      }

      const emails =
        await AdminEmail
          .find(query)
          .sort({
            sentAt: -1,
            createdAt: -1
          })
          .limit(100)

      res.json({
        success: true,
        data:
          emails
      })
    } catch (err) {
      console.error(
        "❌ EMAIL FOLDER ERROR:",
        err
      )

      res
        .status(500)
        .json({
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
        channel ===
        "quotes"
      ) {
        query.createdBy =
          QUOTES_EMAIL
      }

      if (
        channel ===
        "info"
      ) {
        query.createdBy =
          INFO_EMAIL
      }

      if (
        channel ===
        "support"
      ) {
        query.createdBy =
          SUPPORT_EMAIL
      }

      const emails =
        await AdminEmail
          .find(query)
          .sort({
            sentAt: -1,
            createdAt: -1
          })
          .limit(100)

      res.json({
        success: true,

        data:
          emails
      })
    } catch (err) {
      console.error(
        "❌ SENT EMAIL ERROR:",
        err
      )

      res
        .status(500)
        .json({
          success:
            false,

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
        channel ===
        "quotes"
      ) {
        query.createdBy =
          QUOTES_EMAIL
      }

      if (
        channel ===
        "info"
      ) {
        query.createdBy =
          INFO_EMAIL
      }

      if (
        channel ===
        "support"
      ) {
        query.createdBy =
          SUPPORT_EMAIL
      }

      const emails =
        await AdminEmail
          .find(query)
          .sort({
            createdAt: -1
          })
          .limit(100)

      res.json({
        success: true,

        data:
          emails
      })
    } catch (err) {
      console.error(
        "❌ EMAIL HISTORY ERROR:",
        err
      )

      res
        .status(500)
        .json({
          success:
            false,

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
        await AdminEmail
          .findByIdAndUpdate(
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
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Email not found"
          })
      }

      res.json({
        success: true,

        data:
          email
      })
    } catch (err) {
      console.error(
        "❌ EMAIL ARCHIVE ERROR:",
        err
      )

      res
        .status(500)
        .json({
          success:
            false,

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
        await AdminEmail
          .findByIdAndUpdate(
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
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Email not found"
          })
      }

      res.json({
        success: true,

        data:
          email
      })
    } catch (err) {
      console.error(
        "❌ EMAIL RESTORE ERROR:",
        err
      )

      res
        .status(500)
        .json({
          success:
            false,

          message:
            "Failed to restore email"
        })
    }
  }
)

export default router
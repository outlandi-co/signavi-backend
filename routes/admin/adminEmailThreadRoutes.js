import express from "express"
import sgMail from "@sendgrid/mail"

import { requireAuth } from "../../middleware/requireAuth.js"
import AdminEmailThread from "../../models/AdminEmailThread.js"
import AdminEmailMessage from "../../models/AdminEmailMessage.js"

const router = express.Router()

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
    "📧 SENDGRID THREAD EMAIL READY"
  )
} else {
  console.warn(
    "⚠️ SENDGRID_API_KEY missing"
  )
}

/* ================= HELPERS ================= */

const buildHtml = (message = "") => {
  return `
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
}

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

const isValidChannel = (channel = "") => {
  return [
    "info",
    "quotes",
    "support"
  ].includes(channel)
}

const sendSendGridEmail = async ({
  to,
  fromEmail,
  subject,
  message,
  html
}) => {
  if (
    !process.env.SENDGRID_API_KEY
  ) {
    throw new Error(
      "SENDGRID_API_KEY is not configured"
    )
  }

  await sgMail.send({
    to,

    from: {
      email:
        fromEmail,

      name:
        "SignaVi Studio"
    },

    subject,

    text:
      message,

    html
  })

  return {
    success: true
  }
}

/* ================= GET THREADS ================= */

router.get(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      const {
        channel
      } = req.query

      const filter = {
        archived: false
      }

      if (
        isValidChannel(
          channel
        )
      ) {
        filter.channel =
          channel
      }

      const threads =
        await AdminEmailThread
          .find(filter)
          .sort({
            updatedAt: -1
          })

      res.json({
        success: true,
        data:
          threads
      })
    } catch (error) {
      console.error(
        "❌ GET THREADS ERROR:",
        error
      )

      res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load threads"
        })
    }
  }
)

/* ================= GET ARCHIVED THREADS ================= */

router.get(
  "/archived",
  requireAuth,
  async (req, res) => {
    try {
      const {
        channel
      } = req.query

      const filter = {
        archived: true
      }

      if (
        isValidChannel(
          channel
        )
      ) {
        filter.channel =
          channel
      }

      const threads =
        await AdminEmailThread
          .find(filter)
          .sort({
            updatedAt: -1
          })

      res.json({
        success: true,

        data:
          threads
      })
    } catch (error) {
      console.error(
        "❌ GET ARCHIVED THREADS ERROR:",
        error
      )

      res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load archived threads"
        })
    }
  }
)

/* ================= RESTORE THREAD ================= */

router.patch(
  "/:threadId/restore",
  requireAuth,
  async (req, res) => {
    try {
      const thread =
        await AdminEmailThread
          .findByIdAndUpdate(
            req.params.threadId,
            {
              archived:
                false
            },
            {
              returnDocument:
                "after"
            }
          )

      if (!thread) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Thread not found"
          })
      }

      req.app
        .get("io")
        ?.emit(
          "threadRestored",
          thread
        )

      res.json({
        success: true,

        data:
          thread
      })
    } catch (error) {
      console.error(
        "❌ RESTORE THREAD ERROR:",
        error
      )

      res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to restore thread"
        })
    }
  }
)

/* ================= GET THREAD MESSAGES ================= */

router.get(
  "/:threadId/messages",
  requireAuth,
  async (req, res) => {
    try {
      const thread =
        await AdminEmailThread
          .findById(
            req.params.threadId
          )

      if (!thread) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Thread not found"
          })
      }

      const messages =
        await AdminEmailMessage
          .find({
            threadId:
              req.params.threadId
          })
          .sort({
            createdAt: 1
          })

      thread.unread =
        false

      await thread.save()

      res.json({
        success: true,

        data:
          messages
      })
    } catch (error) {
      console.error(
        "❌ GET THREAD MESSAGES ERROR:",
        error
      )

      res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load messages"
        })
    }
  }
)

/* ================= REPLY TO THREAD ================= */

router.post(
  "/:threadId/reply",
  requireAuth,
  async (req, res) => {
    try {
      const {
        message = ""
      } = req.body || {}

      if (
        !message.trim()
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Reply message is required"
          })
      }

      const thread =
        await AdminEmailThread
          .findById(
            req.params.threadId
          )

      if (!thread) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Thread not found"
          })
      }

      const fromEmail =
        getFromEmail(
          thread.channel
        )

      const subject =
        thread.subject ||
        "SignaVi Studio Reply"

      const html =
        buildHtml(
          message
        )

      /* ================= SEND WITH SENDGRID ================= */

      await sendSendGridEmail({
        to:
          thread.customerEmail,

        fromEmail,

        subject,

        message,

        html
      })

      console.log(
        "✅ SENDGRID THREAD REPLY SENT:",
        {
          to:
            thread.customerEmail,

          from:
            fromEmail,

          channel:
            thread.channel
        }
      )

      /* ================= SAVE MESSAGE ================= */

      const savedMessage =
        await AdminEmailMessage
          .create({
            threadId:
              thread._id,

            direction:
              "outbound",

            senderEmail:
              fromEmail,

            senderName:
              "SignaVi Studio",

            to:
              thread.customerEmail,

            subject,

            message,

            html,

            read:
              true
          })

      /* ================= UPDATE THREAD ================= */

      thread.lastMessage =
        message

      thread.unread =
        false

      thread.archived =
        false

      await thread.save()

      /* ================= SOCKET ================= */

      req.app
        .get("io")
        ?.emit(
          "customerEmailReply",
          {
            thread,

            message:
              savedMessage
          }
        )

      res.json({
        success: true,

        provider:
          "sendgrid",

        from:
          fromEmail,

        channel:
          thread.channel,

        data:
          savedMessage
      })
    } catch (error) {
      console.error(
        "❌ REPLY THREAD ERROR:",
        error?.response?.body ||
          error
      )

      res
        .status(500)
        .json({
          success:
            false,

          message:
            "Failed to send reply",

          error:
            error?.response
              ?.body
              ?.errors ||
            error?.message ||
            "Unknown error"
        })
    }
  }
)

/* ================= ARCHIVE THREAD ================= */

router.patch(
  "/:threadId/archive",
  requireAuth,
  async (req, res) => {
    try {
      const thread =
        await AdminEmailThread
          .findByIdAndUpdate(
            req.params.threadId,
            {
              archived:
                true,

              unread:
                false
            },
            {
              returnDocument:
                "after"
            }
          )

      if (!thread) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "Thread not found"
          })
      }

      req.app
        .get("io")
        ?.emit(
          "threadArchived",
          thread
        )

      res.json({
        success: true,

        data:
          thread
      })
    } catch (error) {
      console.error(
        "❌ ARCHIVE THREAD ERROR:",
        error
      )

      res
        .status(500)
        .json({
          success:
            false,

          message:
            "Failed to archive thread"
        })
    }
  }
)

export default router
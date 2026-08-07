import express from "express"
import sgMail from "@sendgrid/mail"

import { requireAuth } from "../../middleware/requireAuth.js"
import AdminEmailThread from "../../models/AdminEmailThread.js"
import AdminEmailMessage from "../../models/AdminEmailMessage.js"

const router = express.Router()

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  "info@signavistudio.store"

const QUOTES_EMAIL =
  process.env.QUOTES_EMAIL ||
  "quotes@signavistudio.store"

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

/* ================= HELPERS ================= */

const buildHtml = (message = "") => {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2>SignaVi Studio</h2>
      <p>${String(message).replace(/\n/g, "<br/>")}</p>
    </div>
  `
}

const getFromEmail = (channel = "info") => {
  return channel === "quotes"
    ? QUOTES_EMAIL
    : INFO_EMAIL
}

/* ================= GET THREADS ================= */

router.get("/", requireAuth, async (req, res) => {
  try {
    const { channel } = req.query

    const filter = {
      archived: false
    }

    if (
      channel === "info" ||
      channel === "quotes"
    ) {
      filter.channel = channel
    }

    const threads = await AdminEmailThread.find(filter)
      .sort({ updatedAt: -1 })

    res.json({
      success: true,
      data: threads
    })
  } catch (error) {
    console.error(
      "❌ GET THREADS ERROR:",
      error
    )

    res.status(500).json({
      success: false,
      message: "Failed to load threads"
    })
  }
})

/* ================= GET ARCHIVED THREADS ================= */

router.get("/archived", requireAuth, async (req, res) => {
  try {
    const { channel } = req.query

    const filter = {
      archived: true
    }

    if (
      channel === "info" ||
      channel === "quotes"
    ) {
      filter.channel = channel
    }

    const threads = await AdminEmailThread.find(filter)
      .sort({ updatedAt: -1 })

    res.json({
      success: true,
      data: threads
    })
  } catch (error) {
    console.error(
      "❌ GET ARCHIVED THREADS ERROR:",
      error
    )

    res.status(500).json({
      success: false,
      message: "Failed to load archived threads"
    })
  }
})

/* ================= RESTORE THREAD ================= */

router.patch(
  "/:threadId/restore",
  requireAuth,
  async (req, res) => {
    try {
      const thread =
        await AdminEmailThread.findByIdAndUpdate(
          req.params.threadId,
          {
            archived: false
          },
          {
            new: true
          }
        )

      if (!thread) {
        return res.status(404).json({
          success: false,
          message: "Thread not found"
        })
      }

      req.app
        .get("io")
        ?.emit("threadRestored", thread)

      res.json({
        success: true,
        data: thread
      })
    } catch (error) {
      console.error(
        "❌ RESTORE THREAD ERROR:",
        error
      )

      res.status(500).json({
        success: false,
        message: "Failed to restore thread"
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
      const messages =
        await AdminEmailMessage.find({
          threadId: req.params.threadId
        }).sort({ createdAt: 1 })

      await AdminEmailThread.findByIdAndUpdate(
        req.params.threadId,
        {
          unread: false
        },
        {
          new: true
        }
      )

      res.json({
        success: true,
        data: messages
      })
    } catch (error) {
      console.error(
        "❌ GET THREAD MESSAGES ERROR:",
        error
      )

      res.status(500).json({
        success: false,
        message: "Failed to load messages"
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

      if (!message.trim()) {
        return res.status(400).json({
          success: false,
          message: "Reply message is required"
        })
      }

      const thread =
        await AdminEmailThread.findById(
          req.params.threadId
        )

      if (!thread) {
        return res.status(404).json({
          success: false,
          message: "Thread not found"
        })
      }

      const fromEmail =
        getFromEmail(thread.channel)

      const html =
        buildHtml(message)

      await sgMail.send({
        to: thread.customerEmail,

        from: {
          email: fromEmail,
          name: "SignaVi Studio"
        },

        subject:
          thread.subject ||
          "SignaVi Studio Reply",

        text: message,
        html
      })

      const savedMessage =
        await AdminEmailMessage.create({
          threadId: thread._id,

          direction: "outbound",

          senderEmail: fromEmail,

          senderName:
            "SignaVi Studio",

          to:
            thread.customerEmail,

          subject:
            thread.subject ||
            "SignaVi Studio Reply",

          message,

          html,

          read: true
        })

      thread.lastMessage = message
      thread.unread = false
      thread.archived = false

      await thread.save()

      req.app
        .get("io")
        ?.emit(
          "customerEmailReply",
          {
            thread,
            message: savedMessage
          }
        )

      res.json({
        success: true,
        data: savedMessage
      })
    } catch (error) {
      console.error(
        "❌ REPLY THREAD ERROR:",
        error
      )

      res.status(500).json({
        success: false,
        message: "Failed to send reply"
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
        await AdminEmailThread.findByIdAndUpdate(
          req.params.threadId,
          {
            archived: true,
            unread: false
          },
          {
            new: true
          }
        )

      if (!thread) {
        return res.status(404).json({
          success: false,
          message: "Thread not found"
        })
      }

      req.app
        .get("io")
        ?.emit("threadArchived", thread)

      res.json({
        success: true,
        data: thread
      })
    } catch (error) {
      console.error(
        "❌ ARCHIVE THREAD ERROR:",
        error
      )

      res.status(500).json({
        success: false,
        message: "Failed to archive thread"
      })
    }
  }
)

export default router
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

const FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "admin@signavistudio.store"

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  console.log("📧 ADMIN EMAIL ROUTE READY")
} else {
  console.warn("⚠️ SENDGRID_API_KEY missing")
}

const buildHtml = (message = "") => `
  <div style="font-family: Arial, sans-serif; color:#111; line-height:1.6;">
    <h2>SignaVi Studio</h2>
    <p>${String(message).replace(/\n/g, "<br/>")}</p>
  </div>
`

const mapSendGridAttachments = (files = []) => {
  return files.map((file) => ({
    content: file.buffer.toString("base64"),
    filename: file.originalname,
    type: file.mimetype,
    disposition: "attachment"
  }))
}

const mapAttachmentMeta = (files = []) => {
  return files.map((file) => ({
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size
  }))
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
        customerId = null,
        customerName = ""
      } = req.body || {}

      if (!to || !subject || !message) {
        return res.status(400).json({
          success: false,
          message: "To, subject, and message are required"
        })
      }

      const html = buildHtml(message)
      const attachments = mapSendGridAttachments(req.files || [])
      const attachmentMeta = mapAttachmentMeta(req.files || [])

      await sgMail.send({
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        from: FROM_EMAIL,
        subject,
        text: message,
        html,
        attachments: attachments.length ? attachments : undefined
      })

      const email = await AdminEmail.create({
        to,
        cc,
        bcc,
        subject,
        message,
        html,
        attachments: attachmentMeta,
        status: "sent",
        archived: false,
        sentAt: new Date(),
        createdBy: req.user?.email || FROM_EMAIL,
        customerId: customerId || null,
        customerName: customerName || ""
      })

      res.json({
        success: true,
        message: "Email sent successfully",
        data: email
      })
    } catch (err) {
      console.error("❌ ADMIN EMAIL ERROR:", err?.response?.body || err)

      try {
        await AdminEmail.create({
          to: req.body?.to || "",
          cc: req.body?.cc || "",
          bcc: req.body?.bcc || "",
          subject: req.body?.subject || "",
          message: req.body?.message || "",
          status: "failed",
          archived: false,
          createdBy: req.user?.email || FROM_EMAIL,
          customerId: req.body?.customerId || null,
          customerName: req.body?.customerName || ""
        })
      } catch (logErr) {
        console.error("❌ EMAIL FAILED LOG ERROR:", logErr)
      }

      res.status(500).json({
        success: false,
        message: "Failed to send email",
        error: err?.message || "Unknown error"
      })
    }
  }
)

/* ================= SAVE DRAFT ================= */

router.post("/drafts", requireAuth, async (req, res) => {
  try {
    const {
      to = "",
      cc = "",
      bcc = "",
      subject = "",
      message = "",
      customerId = null,
      customerName = ""
    } = req.body || {}

    const draft = await AdminEmail.create({
      to,
      cc,
      bcc,
      subject,
      message,
      html: buildHtml(message),
      status: "draft",
      archived: false,
      createdBy: req.user?.email || FROM_EMAIL,
      customerId: customerId || null,
      customerName: customerName || ""
    })

    res.status(201).json({
      success: true,
      data: draft
    })
  } catch (err) {
    console.error("❌ SAVE DRAFT ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to save draft"
    })
  }
})

/* ================= SEND DRAFT ================= */

router.patch("/drafts/:id/send", requireAuth, async (req, res) => {
  try {
    const draft = await AdminEmail.findById(req.params.id)

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "Draft not found"
      })
    }

    if (!draft.to || !draft.subject || !draft.message) {
      return res.status(400).json({
        success: false,
        message: "Draft needs To, subject, and message before sending"
      })
    }

    await sgMail.send({
      to: draft.to,
      cc: draft.cc || undefined,
      bcc: draft.bcc || undefined,
      from: FROM_EMAIL,
      subject: draft.subject,
      text: draft.message,
      html: draft.html || buildHtml(draft.message)
    })

    draft.status = "sent"
    draft.archived = false
    draft.sentAt = new Date()

    await draft.save()

    res.json({
      success: true,
      data: draft
    })
  } catch (err) {
    console.error("❌ SEND DRAFT ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to send draft"
    })
  }
})

/* ================= FOLDERS ================= */

router.get("/folder/:folder", requireAuth, async (req, res) => {
  try {
    const { folder } = req.params

    const query = {}

    if (folder === "sent") {
      query.status = "sent"
      query.archived = false
    }

    if (folder === "drafts") {
      query.status = "draft"
      query.archived = false
    }

    if (folder === "outbox") {
      query.status = { $in: ["queued", "failed"] }
      query.archived = false
    }

    if (folder === "archive") {
      query.archived = true
    }

    if (folder === "all") {
      // no filter
    }

    const emails = await AdminEmail.find(query)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(100)

    res.json({
      success: true,
      data: emails
    })
  } catch (err) {
    console.error("❌ EMAIL FOLDER ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to load email folder"
    })
  }
})

router.get("/sent", requireAuth, async (req, res) => {
  req.params.folder = "sent"
  return router.handle(req, res)
})

/* ================= HISTORY ================= */

router.get("/history", requireAuth, async (req, res) => {
  try {
    const emails = await AdminEmail.find()
      .sort({ createdAt: -1 })
      .limit(100)

    res.json({
      success: true,
      data: emails
    })
  } catch (err) {
    console.error("❌ EMAIL HISTORY ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to load email history"
    })
  }
})

/* ================= ARCHIVE / RESTORE ================= */

router.patch("/archive/:id", requireAuth, async (req, res) => {
  try {
    const email = await AdminEmail.findByIdAndUpdate(
      req.params.id,
      {
        archived: true,
        status: "archived"
      },
      { new: true }
    )

    res.json({
      success: true,
      data: email
    })
  } catch (err) {
    console.error("❌ EMAIL ARCHIVE ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to archive email"
    })
  }
})

router.patch("/restore/:id", requireAuth, async (req, res) => {
  try {
    const email = await AdminEmail.findByIdAndUpdate(
      req.params.id,
      {
        archived: false,
        status: "sent"
      },
      { new: true }
    )

    res.json({
      success: true,
      data: email
    })
  } catch (err) {
    console.error("❌ EMAIL RESTORE ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to restore email"
    })
  }
})

export default router
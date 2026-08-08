import { v2 as cloudinary } from "cloudinary"

import AdminEmailThread from "../models/AdminEmailThread.js"
import AdminEmailMessage from "../models/AdminEmailMessage.js"
import Notification from "../models/Notification.js"

/* =========================================================
   EMAIL CONFIG
========================================================= */

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ||
  "support@signavistudio.store"

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  "info@signavistudio.store"

const QUOTES_EMAIL =
  process.env.QUOTES_EMAIL ||
  "quote@signavistudio.store"

/* =========================================================
   CLOUDINARY CONFIG
========================================================= */

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_NAME,

  api_key:
    process.env.CLOUDINARY_API_KEY ||
    process.env.CLOUDINARY_KEY,

  api_secret:
    process.env.CLOUDINARY_API_SECRET ||
    process.env.CLOUDINARY_SECRET
})

/* =========================================================
   EMAIL HELPERS
========================================================= */

const cleanEmail = (value = "") => {
  const match =
    String(value).match(/<(.+?)>/)

  return (
    match
      ? match[1]
      : String(value)
  )
    .trim()
    .toLowerCase()
}

const getChannel = (to = "") => {
  const email =
    cleanEmail(to)

  if (
    email ===
    SUPPORT_EMAIL.toLowerCase()
  ) {
    return "support"
  }

  if (
    email ===
    QUOTES_EMAIL.toLowerCase()
  ) {
    return "quotes"
  }

  if (
    email ===
    INFO_EMAIL.toLowerCase()
  ) {
    return "info"
  }

  return "info"
}

const getNotificationTitle = (
  channel
) => {
  switch (channel) {
    case "support":
      return "New Support Email"

    case "quotes":
      return "New Quote Email"

    case "info":
    default:
      return "New Information Email"
  }
}

/* =========================================================
   ATTACHMENT HELPERS
========================================================= */

const sanitizeFileName = (
  fileName = "attachment"
) => {
  return String(fileName)
    .replace(/[^\w.\-() ]+/g, "_")
    .trim()
}

const uploadAttachmentToCloudinary =
  async (file) => {
    return new Promise(
      (resolve, reject) => {
        const safeFileName =
          sanitizeFileName(
            file.originalname
          )

        const uploadStream =
          cloudinary.uploader.upload_stream(
            {
              folder:
                "signavi/email-attachments",

              resource_type:
                "auto",

              use_filename:
                true,

              unique_filename:
                true,

              filename_override:
                safeFileName
            },

            (error, result) => {
              if (error) {
                console.error(
                  "❌ CLOUDINARY EMAIL ATTACHMENT ERROR:",
                  error
                )

                return reject(
                  error
                )
              }

              resolve({
                fileName:
                  safeFileName,

                mimeType:
                  file.mimetype ||
                  "",

                size:
                  file.size ||
                  0,

                url:
                  result?.secure_url ||
                  ""
              })
            }
          )

        uploadStream.end(
          file.buffer
        )
      }
    )
  }

const uploadInboundAttachments =
  async (files = []) => {
    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return []
    }

    const attachments = []

    for (const file of files) {
      try {
        const uploaded =
          await uploadAttachmentToCloudinary(
            file
          )

        attachments.push(
          uploaded
        )
      } catch (error) {
        console.error(
          `❌ ATTACHMENT UPLOAD FAILED: ${file?.originalname || "unknown file"}`,
          error?.message ||
            error
        )
      }
    }

    return attachments
  }

/* =========================================================
   RECEIVE INBOUND EMAIL
========================================================= */

export const receiveInboundEmail =
  async (req, res) => {
    try {
      const from =
        cleanEmail(
          req.body.from || ""
        )

      const to =
        cleanEmail(
          req.body.to ||
            INFO_EMAIL
        )

      const subject =
        req.body.subject ||
        "Customer Message"

      const text =
        req.body.text ||
        req.body.html ||
        ""

      const channel =
        getChannel(to)

      /* ===============================================
         UPLOAD ATTACHMENTS
      =============================================== */

      const attachments =
        await uploadInboundAttachments(
          req.files || []
        )

      console.log(
        "📎 INBOUND ATTACHMENTS:",
        {
          count:
            attachments.length,

          files:
            attachments.map(
              (item) =>
                item.fileName
            )
        }
      )

      /* ===============================================
         VALIDATION

         Allow:
         - message only
         - attachment only
         - message + attachment
      =============================================== */

      if (!from) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Inbound email missing sender"
          })
      }

      if (
        !text &&
        attachments.length === 0
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Inbound email contains no message or attachments"
          })
      }

      /* ===============================================
         THREAD PREVIEW
      =============================================== */

      const lastMessage =
        text ||
        (
          attachments.length === 1
            ? `📎 ${attachments[0].fileName}`
            : `📎 ${attachments.length} attachments`
        )

      /* ===============================================
         FIND / CREATE THREAD
      =============================================== */

      let thread =
        await AdminEmailThread.findOne(
          {
            customerEmail:
              from,

            subject,

            channel
          }
        )

      if (!thread) {
        thread =
          await AdminEmailThread.create(
            {
              customerEmail:
                from,

              subject,

              channel,

              lastMessage,

              unread:
                true,

              archived:
                false
            }
          )
      } else {
        thread.lastMessage =
          lastMessage

        thread.unread =
          true

        thread.archived =
          false

        await thread.save()
      }

      /* ===============================================
         SAVE MESSAGE
      =============================================== */

      const message =
        await AdminEmailMessage.create(
          {
            threadId:
              thread._id,

            direction:
              "inbound",

            senderEmail:
              from,

            to,

            subject,

            message:
              text ||
              "Attachment received.",

            html:
              req.body.html ||
              "",

            attachments,

            read:
              false
          }
        )

      /* ===============================================
         NOTIFICATION
      =============================================== */

      let notificationText =
        text
          ? `${from}: ${text.slice(
              0,
              120
            )}`
          : `${from}: Sent ${attachments.length} attachment${
              attachments.length === 1
                ? ""
                : "s"
            }`

      if (
        attachments.length > 0 &&
        text
      ) {
        notificationText +=
          ` 📎 ${attachments.length}`
      }

      const notification =
        await Notification.create(
          {
            userEmail:
              ADMIN_EMAIL,

            title:
              getNotificationTitle(
                channel
              ),

            text:
              notificationText,

            type:
              "admin",

            link:
              `/admin/inbox?channel=${channel}`,

            read:
              false,

            archived:
              false
          }
        )

      /* ===============================================
         SOCKET EVENTS
      =============================================== */

      req.app
        .get("io")
        ?.emit(
          "adminNotification",
          notification
        )

      req.app
        .get("io")
        ?.emit(
          "customerEmailReply",
          {
            thread,
            message
          }
        )

      /* ===============================================
         RESPONSE
      =============================================== */

      res.json({
        success:
          true,

        channel,

        attachmentCount:
          attachments.length,

        data: {
          thread,
          message
        }
      })
    } catch (error) {
      console.error(
        "❌ INBOUND EMAIL ERROR:",
        error
      )

      res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to receive inbound email"
        })
    }
  }
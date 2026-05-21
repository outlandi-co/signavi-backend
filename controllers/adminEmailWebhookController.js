import AdminEmailThread from "../models/AdminEmailThread.js"
import AdminEmailMessage from "../models/AdminEmailMessage.js"
import Notification from "../models/Notification.js"

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

const cleanEmail = (value = "") => {
  const match = value.match(/<(.+?)>/)
  return (match ? match[1] : value).trim().toLowerCase()
}

export const receiveInboundEmail = async (req, res) => {
  try {
    const from = cleanEmail(req.body.from || "")
    const to = cleanEmail(req.body.to || ADMIN_EMAIL)
    const subject = req.body.subject || "Customer Reply"
    const text = req.body.text || req.body.html || ""

    if (!from || !text) {
      return res.status(400).json({
        success: false,
        message: "Inbound email missing sender or message"
      })
    }

    let thread = await AdminEmailThread.findOne({
      customerEmail: from,
      subject
    })

    if (!thread) {
      thread = await AdminEmailThread.create({
        customerEmail: from,
        subject,
        lastMessage: text,
        unread: true
      })
    } else {
      thread.lastMessage = text
      thread.unread = true
      thread.archived = false
      await thread.save()
    }

    const message = await AdminEmailMessage.create({
      threadId: thread._id,
      direction: "inbound",
      senderEmail: from,
      to,
      subject,
      message: text,
      html: req.body.html || "",
      read: false
    })

    const notification = await Notification.create({
      userEmail: ADMIN_EMAIL,
      title: "Customer Reply",
      text: `${from} replied: ${text.slice(0, 120)}`,
      type: "admin",
      link: "/admin/emails",
      read: false,
      archived: false
    })

    req.app.get("io")?.emit("adminNotification", notification)
    req.app.get("io")?.emit("customerEmailReply", {
      thread,
      message
    })

    res.json({
      success: true,
      data: {
        thread,
        message
      }
    })
  } catch (error) {
    console.error("❌ INBOUND EMAIL ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
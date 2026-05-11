import express from "express"
import SupportTicket from "../../models/SupportTicket.js"

const router = express.Router()

/* ================= TEST ================= */

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Support routes working"
  })
})

/* ================= GET ALL / FILTER ================= */

router.get("/", async (req, res) => {
  try {
    const { email, status, archived } = req.query

    const filter = {}

    if (email) {
      filter.email = String(email).trim().toLowerCase()
    }

    if (status && status !== "all") {
      filter.status = status
    }

    if (archived === "true") {
      filter.archived = true
    }

    if (archived === "false") {
      filter.archived = false
    }

    const tickets = await SupportTicket.find(filter).sort({
      lastMessageAt: -1,
      createdAt: -1
    })

    res.json({
      success: true,
      data: tickets
    })
  } catch (err) {
    console.error("❌ SUPPORT GET ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to load support tickets"
    })
  }
})

/* ================= CREATE ================= */

router.post("/", async (req, res) => {
  try {
    const {
      customerName,
      email,
      subject,
      message,
      orderNumber
    } = req.body

    if (!email || !message) {
      return res.status(400).json({
        success: false,
        message: "Email and message are required"
      })
    }

    const ticket = await SupportTicket.create({
      customerName: customerName || "Customer",
      email: String(email).trim().toLowerCase(),
      subject: subject || "Support Request",
      message,
      orderNumber: orderNumber || "",
      status: "open",
      archived: false,
      unreadAdminCount: 1,
      unreadCustomerCount: 0,
      lastMessage: message,
      lastMessageAt: new Date(),
      replies: []
    })

    const io = req.app.get("io")

    if (io) {
      io.emit("support:new-message", {
        sender: "customer",
        ticketId: ticket._id,
        ticket,
        message: `${ticket.customerName} created a ticket`
      })

      io.emit("support:ticket-updated", ticket)
    }

    res.json({
      success: true,
      data: ticket
    })
  } catch (err) {
    console.error("❌ SUPPORT CREATE ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to create ticket"
    })
  }
})

/* ================= REPLY ================= */

router.post("/:id/reply", async (req, res) => {
  try {
    const { sender, message } = req.body

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required"
      })
    }

    const ticket = await SupportTicket.findById(req.params.id)

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      })
    }

    if (ticket.archived) {
      return res.status(400).json({
        success: false,
        message: "Cannot reply to an archived ticket"
      })
    }

    const cleanSender =
      sender === "customer"
        ? "customer"
        : "admin"

    ticket.replies.push({
      sender: cleanSender,
      message,
      createdAt: new Date()
    })

    ticket.lastMessage = message
    ticket.lastMessageAt = new Date()

    if (
      ticket.status === "closed" &&
      cleanSender === "customer"
    ) {
      ticket.status = "open"
      ticket.closedAt = null
    }

    if (cleanSender === "customer") {
      ticket.unreadAdminCount =
        Number(ticket.unreadAdminCount || 0) + 1
    }

    if (cleanSender === "admin") {
      ticket.unreadCustomerCount =
        Number(ticket.unreadCustomerCount || 0) + 1
    }

    await ticket.save()

    const io = req.app.get("io")

    if (io) {
      io.emit("support:new-message", {
        sender: cleanSender,
        ticketId: ticket._id,
        ticket,
        message:
          cleanSender === "admin"
            ? "Admin replied"
            : `${ticket.customerName} replied`
      })

      io.emit("support:ticket-updated", ticket)
    }

    res.json({
      success: true,
      data: ticket
    })
  } catch (err) {
    console.error("❌ SUPPORT REPLY ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to reply"
    })
  }
})

/* ================= MARK READ ================= */

router.patch("/:id/read", async (req, res) => {
  try {
    const { reader = "admin" } = req.body

    const ticket = await SupportTicket.findById(req.params.id)

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      })
    }

    if (reader === "customer") {
      ticket.unreadCustomerCount = 0
    } else {
      ticket.unreadAdminCount = 0
    }

    await ticket.save()

    const io = req.app.get("io")

    if (io) {
      io.emit("support:ticket-updated", ticket)
    }

    res.json({
      success: true,
      data: ticket
    })
  } catch (err) {
    console.error("❌ SUPPORT READ ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to mark ticket as read"
    })
  }
})

/* ================= CLOSE ================= */

router.patch("/:id/close", async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      })
    }

    ticket.status = "closed"
    ticket.closedAt = new Date()

    await ticket.save()

    const io = req.app.get("io")

    if (io) {
      io.emit("support:ticket-updated", ticket)

      io.emit("support:ticket-closed", {
        ticketId: ticket._id,
        ticket
      })
    }

    res.json({
      success: true,
      data: ticket
    })
  } catch (err) {
    console.error("❌ SUPPORT CLOSE ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to close ticket"
    })
  }
})

/* ================= REOPEN ================= */

router.patch("/:id/reopen", async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      })
    }

    ticket.status = "open"
    ticket.archived = false
    ticket.closedAt = null
    ticket.archivedAt = null

    await ticket.save()

    const io = req.app.get("io")

    if (io) {
      io.emit("support:ticket-updated", ticket)
    }

    res.json({
      success: true,
      data: ticket
    })
  } catch (err) {
    console.error("❌ SUPPORT REOPEN ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to reopen ticket"
    })
  }
})

/* ================= ARCHIVE ================= */

router.patch("/:id/archive", async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found"
      })
    }

    ticket.status = "archive"
    ticket.archived = true
    ticket.archivedAt = new Date()
    ticket.unreadAdminCount = 0
    ticket.unreadCustomerCount = 0

    await ticket.save()

    const io = req.app.get("io")

    if (io) {
      io.emit("support:ticket-updated", ticket)

      io.emit("support:ticket-archived", {
        ticketId: ticket._id,
        ticket
      })
    }

    res.json({
      success: true,
      data: ticket
    })
  } catch (error) {
    console.error("❌ ARCHIVE SUPPORT ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to archive support ticket"
    })
  }
})

export default router

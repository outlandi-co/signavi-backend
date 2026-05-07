import express from "express"
import SupportTicket from "../../models/SupportTicket.js"

const router = express.Router()

/* ================= CREATE TICKET ================= */

router.post("/", async (req, res) => {

  try {

    const {
      customerName,
      email,
      subject,
      message,
      orderNumber,
      priority
    } = req.body || {}

    if (
      !customerName ||
      !email ||
      !subject ||
      !message
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Missing required fields"
      })
    }

    const ticket =
      await SupportTicket.create({

        customerName,

        email,

        subject,

        message,

        orderNumber:
          orderNumber || "",

        priority:
          priority || "medium",

        status: "open"
      })

    console.log(
      "🛟 SUPPORT TICKET CREATED:",
      ticket._id
    )

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ CREATE TICKET ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Failed to create ticket"
    })
  }
})

/* ================= GET ALL ================= */

router.get("/", async (req, res) => {

  try {

    const tickets =
      await SupportTicket
        .find()
        .sort({
          createdAt: -1
        })

    res.json({
      success: true,
      data: tickets
    })

  } catch (err) {

    console.error(
      "❌ LOAD TICKETS ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Failed to load tickets"
    })
  }
})

/* ================= GET SINGLE ================= */

router.get("/:id", async (req, res) => {

  try {

    const ticket =
      await SupportTicket.findById(
        req.params.id
      )

    if (!ticket) {

      return res.status(404).json({
        success: false,
        message:
          "Ticket not found"
      })
    }

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ LOAD TICKET ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Failed to load ticket"
    })
  }
})

/* ================= REPLY ================= */

router.post("/:id/reply", async (req, res) => {

  try {

    const { message } =
      req.body || {}

    if (!message?.trim()) {

      return res.status(400).json({
        success: false,
        message:
          "Reply message required"
      })
    }

    const ticket =
      await SupportTicket.findById(
        req.params.id
      )

    if (!ticket) {

      return res.status(404).json({
        success: false,
        message:
          "Ticket not found"
      })
    }

    ticket.replies.push({

      sender: "admin",

      message
    })

    /* 🔥 AUTO MOVE TO PENDING */

    if (
      ticket.status === "open"
    ) {

      ticket.status =
        "pending"
    }

    await ticket.save()

    console.log(
      "📨 SUPPORT REPLY:",
      ticket._id
    )

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ REPLY ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Reply failed"
    })
  }
})

/* ================= STATUS ================= */

router.patch("/:id/status", async (req, res) => {

  try {

    const {
      status
    } = req.body || {}

    const valid = [
      "open",
      "pending",
      "resolved"
    ]

    if (
      !valid.includes(status)
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid status"
      })
    }

    const ticket =
      await SupportTicket.findByIdAndUpdate(

        req.params.id,

        {
          status
        },

        {
          new: true
        }
      )

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ STATUS ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Failed to update status"
    })
  }
})

/* ================= PRIORITY ================= */

router.patch("/:id/priority", async (req, res) => {

  try {

    const {
      priority
    } = req.body || {}

    const valid = [
      "low",
      "medium",
      "high"
    ]

    if (
      !valid.includes(priority)
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid priority"
      })
    }

    const ticket =
      await SupportTicket.findByIdAndUpdate(

        req.params.id,

        {
          priority
        },

        {
          new: true
        }
      )

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ PRIORITY ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Failed to update priority"
    })
  }
})

/* ================= ARCHIVE ================= */

router.patch("/:id/archive", async (req, res) => {

  try {

    const ticket =
      await SupportTicket.findByIdAndUpdate(

        req.params.id,

        {
          archived: true
        },

        {
          new: true
        }
      )

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ ARCHIVE ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Archive failed"
    })
  }
})

/* ================= UNARCHIVE ================= */

router.patch("/:id/unarchive", async (req, res) => {

  try {

    const ticket =
      await SupportTicket.findByIdAndUpdate(

        req.params.id,

        {
          archived: false
        },

        {
          new: true
        }
      )

    res.json({
      success: true,
      data: ticket
    })

  } catch (err) {

    console.error(
      "❌ UNARCHIVE ERROR:",
      err
    )

    res.status(500).json({
      success: false,
      message:
        "Unarchive failed"
    })
  }
})

export default router
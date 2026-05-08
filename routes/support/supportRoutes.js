import express from "express"
import SupportTicket from "../../models/SupportTicket.js"

const router = express.Router()

/* ================= TEST ================= */

router.get(
  "/test",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Support routes working"
    })
  }
)

/* ================= GET ALL / FILTER ================= */

router.get(
  "/",
  async (req, res) => {

    try {

      console.log(
        "🛟 SUPPORT GET HIT"
      )

      const { email } =
        req.query

      let filter = {}

      /* ================= CUSTOMER FILTER ================= */

      if (email) {

        filter.email = email
      }

      const tickets =
        await SupportTicket.find(filter)
          .sort({
            createdAt: -1
          })

      console.log(
        "📦 SUPPORT TICKETS:",
        tickets.length
      )

      res.json({

        success: true,

        data: tickets
      })

    } catch (err) {

      console.error(
        "❌ SUPPORT GET ERROR:",
        err
      )

      res.status(500).json({

        success: false,

        message:
          "Failed to load support tickets"
      })
    }
  }
)

/* ================= CREATE ================= */

router.post(
  "/",
  async (req, res) => {

    try {

      const {
        customerName,
        email,
        subject,
        message
      } = req.body

      console.log(
        "📨 NEW SUPPORT TICKET:",
        {
          customerName,
          email,
          subject
        }
      )

      const ticket =
        await SupportTicket.create({

          customerName,

          email,

          subject,

          message,

          status: "open",

          replies: []
        })

      /* ================= SOCKET ================= */

      const io =
        req.app.get("io")

      if (!io) {

        console.log(
          "❌ IO NOT FOUND"
        )
      }

      else {

        console.log(
          "🔥 EMITTING NEW TICKET EVENT"
        )

        io.emit(
          "support:new-message",
          {

            sender:
              "customer",

            ticketId:
              ticket._id,

            message:
              `${customerName} created a ticket`
          }
        )
      }

      res.json({

        success: true,

        data: ticket
      })

    } catch (err) {

      console.error(
        "❌ SUPPORT CREATE ERROR:",
        err
      )

      res.status(500).json({

        success: false,

        message:
          "Failed to create ticket"
      })
    }
  }
)

/* ================= REPLY ================= */

router.post(
  "/:id/reply",
  async (req, res) => {

    try {

      const {
        sender,
        message
      } = req.body

      console.log(
        "📨 NEW SUPPORT REPLY:",
        {
          sender,
          message
        }
      )

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

      /* ================= CLEAN SENDER ================= */

      const cleanSender =
        sender === "customer"
          ? "customer"
          : "admin"

      /* ================= SAVE REPLY ================= */

      ticket.replies.push({

        sender:
          cleanSender,

        message,

        createdAt:
          new Date()
      })

      await ticket.save()

      console.log(
        "✅ REPLY SAVED"
      )

      /* ================= SOCKET ================= */

      const io =
        req.app.get("io")

      if (!io) {

        console.log(
          "❌ IO NOT FOUND"
        )
      }

      else {

        console.log(
          "🔥 EMITTING SUPPORT REPLY EVENT"
        )

        console.log(
  "🔥 ABOUT TO EMIT:",
  {
    sender: cleanSender,
    ticketId: ticket._id
  }
)

        io.emit(
          "support:new-message",
          {

            sender:
              cleanSender,

            ticketId:
              ticket._id,

            message:
              cleanSender === "admin"
                ? "Admin replied"
                : `${ticket.customerName} replied`
          }
        )
      }

      res.json({

        success: true,

        data: ticket
      })

    } catch (err) {

      console.error(
        "❌ SUPPORT REPLY ERROR:",
        err
      )

      res.status(500).json({

        success: false,

        message:
          "Failed to reply"
      })
    }
  }
)

export default router
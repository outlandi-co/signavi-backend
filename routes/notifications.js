import express from "express"
import Notification from "../models/Notification.js"
import { sendNotificationEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= GET USER NOTIFICATIONS ================= */
router.get("/", async (req, res) => {
  try {
    /* 🔥 SAFE EMAIL EXTRACTION (USER OR GUEST) */
    const email =
      req.user?.email ||           // logged-in user
      req.query?.email ||          // guest fallback via query
      null

    if (!email) {
      return res.status(400).json({
        message: "Email required"
      })
    }

    const notifications = await Notification.find({ userEmail: email })
      .sort({ createdAt: -1 })
      .limit(20)

    res.json({
      success: true,
      data: notifications
    })

  } catch (err) {
    console.error("❌ GET NOTIFICATIONS ERROR:", err.message)

    res.status(500).json({
      message: "Failed to load notifications"
    })
  }
})

/* ================= BROADCAST ================= */
router.post("/broadcast", async (req, res) => {
  try {
    const { message, email } = req.body

    if (!message) {
      return res.status(400).json({
        message: "Message required"
      })
    }

    /* 🔥 TARGET USERS */
    const users = email
      ? [email]
      : await Notification.distinct("userEmail")

    for (const userEmail of users) {

      /* 🔥 SAVE */
      await Notification.create({
        userEmail,
        text: message,
        read: false
      })

      /* 🔥 SOCKET EVENT */
      req.app.get("io")?.emit("jobUpdated", {
        email: userEmail,
        text: message
      })

      /* 🔥 EMAIL (SAFE) */
      try {
        await sendNotificationEmail(
          userEmail,
          "New Notification",
          message
        )
      } catch (emailErr) {
        console.warn("⚠️ Email failed:", emailErr.message)
      }
    }

    res.json({ success: true })

  } catch (err) {
    console.error("❌ BROADCAST ERROR:", err.message)

    res.status(500).json({
      message: "Broadcast failed"
    })
  }
})

export default router
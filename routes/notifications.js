import express from "express"
import Notification from "../models/Notification.js"
import { sendNotificationEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= GET USER NOTIFICATIONS ================= */
router.get("/", async (req, res) => {
  try {
    const email = req.user.email

    const notifications = await Notification.find({ userEmail: email })
      .sort({ createdAt: -1 })
      .limit(20)

    res.json(notifications)

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= MARK ONE READ ================= */
router.put("/read/:id", async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    )

    res.json(notif)

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= MARK ALL READ ================= */
router.put("/read", async (req, res) => {
  try {
    const email = req.user.email

    await Notification.updateMany(
      { userEmail: email, read: false },
      { read: true }
    )

    res.json({ success: true })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= ADMIN BROADCAST ================= */
router.post("/broadcast", async (req, res) => {
  try {
    const { message, email } = req.body

    if (!message) {
      return res.status(400).json({ message: "Message required" })
    }

    let users = []

    if (email) {
      users = [email]
    } else {
      users = await Notification.distinct("userEmail")
    }

    const created = []

    for (const userEmail of users) {

      const notif = await Notification.create({
        userEmail,
        text: message,
        read: false
      })

      created.push(notif)

      // 🔔 SOCKET
      req.app.get("io")?.emit("jobUpdated", {
        email: userEmail,
        text: message
      })

      // 📧 EMAIL (🔥 NEW)
      await sendNotificationEmail(
        userEmail,
        "New Notification",
        message
      )
    }

    res.json({ success: true, count: created.length })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
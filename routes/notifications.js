import express from "express"
import Notification from "../models/Notification.js"
import { sendNotificationEmail } from "../utils/sendEmail.js"

const router = express.Router()

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

router.post("/broadcast", async (req, res) => {
  try {
    const { message, email } = req.body

    if (!message) {
      return res.status(400).json({ message: "Message required" })
    }

    const users = email ? [email] : await Notification.distinct("userEmail")

    for (const userEmail of users) {

      await Notification.create({
        userEmail,
        text: message,
        read: false
      })

      req.app.get("io")?.emit("jobUpdated", {
        email: userEmail,
        text: message
      })

      await sendNotificationEmail(
        userEmail,
        "New Notification",
        message
      )
    }

    res.json({ success: true })

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
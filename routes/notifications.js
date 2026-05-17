import express from "express"
import Notification from "../models/Notification.js"

const router = express.Router()

const ADMIN_EMAIL = "admin@signavistudio.store"

/* ================= GET NOTIFICATIONS ================= */

router.get("/", async (req, res) => {
  try {
    const email =
      req.user?.email ||
      req.query?.email ||
      ADMIN_EMAIL

    const notifications =
      await Notification.find({
        userEmail: email,
        archived: false
      })
        .sort({ createdAt: -1 })
        .limit(100)

    res.json({
      success: true,
      data: notifications
    })
  } catch (err) {
    console.error(
      "❌ GET NOTIFICATIONS ERROR:",
      err.message
    )

    res.status(500).json({
      success: false,
      message: "Failed to load notifications"
    })
  }
})

/* ================= MARK READ ================= */

router.patch("/:id/read", async (req, res) => {
  try {
    const notification =
      await Notification.findByIdAndUpdate(
        req.params.id,
        { read: true },
        { new: true }
      )

    res.json({
      success: true,
      data: notification
    })
  } catch (err) {
    console.error(
      "❌ MARK READ ERROR:",
      err.message
    )

    res.status(500).json({
      success: false,
      message: "Failed to mark notification read"
    })
  }
})

/* ================= MARK ALL READ ================= */

router.patch("/read-all", async (req, res) => {
  try {
    const email =
      req.user?.email ||
      req.query?.email ||
      ADMIN_EMAIL

    await Notification.updateMany(
      {
        userEmail: email,
        archived: false
      },
      {
        read: true
      }
    )

    res.json({
      success: true,
      message: "All notifications marked read"
    })
  } catch (err) {
    console.error(
      "❌ MARK ALL READ ERROR:",
      err.message
    )

    res.status(500).json({
      success: false,
      message: "Failed to mark notifications read"
    })
  }
})

/* ================= ARCHIVE ================= */

router.patch("/:id/archive", async (req, res) => {
  try {
    const notification =
      await Notification.findByIdAndUpdate(
        req.params.id,
        {
          archived: true,
          read: true
        },
        { new: true }
      )

    res.json({
      success: true,
      data: notification
    })
  } catch (err) {
    console.error(
      "❌ ARCHIVE ERROR:",
      err.message
    )

    res.status(500).json({
      success: false,
      message: "Failed to archive notification"
    })
  }
})

/* ================= BROADCAST ================= */

router.post("/broadcast", async (req, res) => {
  try {
    const {
      message,
      email,
      title = "Notification",
      type = "system",
      link = ""
    } = req.body

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message required"
      })
    }

    const users = email
      ? [email]
      : [ADMIN_EMAIL]

    for (const userEmail of users) {
      const notification =
        await Notification.create({
          userEmail,
          title,
          text: message,
          type,
          link,
          read: false
        })

      req.app.get("io")?.emit(
        "adminNotification",
        notification
      )
    }

    res.json({
      success: true
    })
  } catch (err) {
    console.error(
      "❌ BROADCAST ERROR:",
      err.message
    )

    res.status(500).json({
      success: false,
      message: "Broadcast failed"
    })
  }
})

export default router
import express from "express"
import Notification from "../models/Notification.js"

const router = express.Router()

/* ================= GET NOTIFICATIONS ================= */

router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({
      archived: false
    })
      .sort({ createdAt: -1 })
      .limit(100)

    res.json({
      success: true,
      data: notifications
    })
  } catch (err) {
    console.error("❌ GET NOTIFICATIONS ERROR:", err.message)

    res.status(500).json({
      success: false,
      message: "Failed to load notifications"
    })
  }
})

/* ================= MARK ALL READ ================= */

router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      { archived: false },
      { read: true }
    )

    res.json({
      success: true,
      message: "All notifications marked read"
    })
  } catch (err) {
    console.error("❌ MARK ALL READ ERROR:", err.message)

    res.status(500).json({
      success: false,
      message: "Failed to mark notifications read"
    })
  }
})

/* ================= MARK READ ================= */

router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    )

    res.json({
      success: true,
      data: notification
    })
  } catch (err) {
    console.error("❌ MARK READ ERROR:", err.message)

    res.status(500).json({
      success: false,
      message: "Failed to mark notification read"
    })
  }
})

/* ================= ARCHIVE ================= */

router.patch("/:id/archive", async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
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
    console.error("❌ ARCHIVE ERROR:", err.message)

    res.status(500).json({
      success: false,
      message: "Failed to archive notification"
    })
  }
})

/* ================= TEST / BROADCAST ================= */

router.post("/broadcast", async (req, res) => {
  try {
    const {
      message = "Test notification",
      title = "Notification",
      type = "system",
      link = "/admin/invoices"
    } = req.body

    const notification = await Notification.create({
      userEmail: "admin@signavistudio.store",
      title,
      text: message,
      type,
      link,
      read: false,
      archived: false
    })

    req.app.get("io")?.emit("adminNotification", notification)

    res.json({
      success: true,
      data: notification
    })
  } catch (err) {
    console.error("❌ BROADCAST ERROR:", err.message)

    res.status(500).json({
      success: false,
      message: "Broadcast failed"
    })
  }
})

export default router
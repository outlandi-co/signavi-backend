import express from "express"
import Notification from "../models/Notification.js"
import SmartShippingV3PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { createV3ReconciliationAlert } from "../utils/createV3ReconciliationAlert.js"

const router = express.Router()

/* ================= V3 RECONCILIATION MONITOR ================= */
/*
 * Read-only administrator endpoint.
 * Authentication and admin authorization are enforced
 * by the /api/notifications mount in server.js.
 */
router.get("/v3/reconciliation", async (_req, res) => {
  try {
    const filter = { status: "reconciliation_required" }

    const [total, operations] = await Promise.all([
      SmartShippingV3PaymentOperation.countDocuments(filter),
      SmartShippingV3PaymentOperation.find(filter)
        .select("orderId status updatedAt")
        .sort({ updatedAt: -1 })
        .limit(25)
        .lean()
    ])

    return res.json({
      success: true,
      data: {
        totalRequiringReconciliation: total,
        operations: operations.map(operation => ({
          orderId: String(operation.orderId),
          status: operation.status,
          updatedAt: operation.updatedAt
        }))
      }
    })
  } catch (error) {
    console.error(
      "V3 reconciliation monitor query failed"
    )

    return res.status(500).json({
      success: false,
      message: "Unable to load reconciliation summary"
    })
  }
})
/* ================= V3 ADMIN ALERT TRIGGER ================= */
/*
 * Explicit administrator action only.
 * Protected by requireAuth and admin role at the server.js mount.
 * No payment mutation or Square request.
 */
router.post("/v3/reconciliation/alert", async (req, res) => {
  try {
    const orderId = req.body?.orderId

    if (typeof orderId !== "string" ||
        !/^[a-f0-9]{24}$/i.test(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Valid orderId required"
      })
    }

    const result = await createV3ReconciliationAlert({
      orderId: orderId.toLowerCase()
    })

    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        created: result.created,
        reason: result.reason ?? null
      }
    })
  } catch (_error) {
    console.error("V3 reconciliation alert trigger failed")

    return res.status(503).json({
      success: false,
      message: "Reconciliation alert unavailable"
    })
  }
})
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
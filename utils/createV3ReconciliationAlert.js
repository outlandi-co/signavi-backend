import mongoose from "mongoose"
import Notification from "../models/Notification.js"
import SmartShippingV3PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const ADMIN_EMAIL = "admin@signavistudio.store"

export const createV3ReconciliationAlert = async ({
  orderId,
  notificationModel = Notification,
  paymentOperationModel = SmartShippingV3PaymentOperation
} = {}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Valid orderId required")
  }

  const id = String(orderId)

  // Verify the actual database index, not just the Mongoose schema.
  const indexes = await notificationModel.collection.indexes()

  const hasUniqueIndex = indexes.some(index =>
    index.key?.dedupeKey === 1 &&
    index.unique === true &&
    index.partialFilterExpression?.dedupeKey?.$type === "string"
  )

  if (!hasUniqueIndex) {
    throw new Error("Notification deduplication index not verified")
  }

  // Inspect only the requested V3 operation.
  const operation = await paymentOperationModel.findOne({
    orderId: new mongoose.Types.ObjectId(id),
    status: "reconciliation_required"
  }).select("_id").lean()

  if (!operation) {
    return {
      created: false,
      reason: "reconciliation_not_required"
    }
  }

  const dedupeKey = `v3-reconciliation:${id}`

  try {
    const notification = await notificationModel.create({
      userEmail: ADMIN_EMAIL,
      title: "Smart Shipping V3 reconciliation required",
      text: "A Sandbox payment operation requires manual review.",
      type: "admin",
      orderId: new mongoose.Types.ObjectId(id),
      link: "/admin/notifications",
      dedupeKey
    })

    return {
      created: true,
      notification
    }
  } catch (error) {
    if (
      error?.code === 11000 &&
      error?.keyPattern?.dedupeKey === 1
    ) {
      return {
        created: false,
        reason: "already_alerted"
      }
    }

    throw error
  }
}
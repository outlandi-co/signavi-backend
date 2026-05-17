import mongoose from "mongoose"

const notificationSchema = new mongoose.Schema(
  {
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    title: {
      type: String,
      default: ""
    },

    text: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: [
        "order",
        "invoice",
        "payment",
        "proof",
        "production",
        "system",
        "admin"
      ],
      default: "system"
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null
    },

    link: {
      type: String,
      default: ""
    },

    read: {
      type: Boolean,
      default: false
    },

    archived: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
)

export default mongoose.model(
  "Notification",
  notificationSchema
)
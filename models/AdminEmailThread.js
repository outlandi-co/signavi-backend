import mongoose from "mongoose"

const adminEmailThreadSchema = new mongoose.Schema(
  {
    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    customerName: {
      type: String,
      default: ""
    },

    subject: {
      type: String,
      default: ""
    },

    lastMessage: {
      type: String,
      default: ""
    },

    unread: {
      type: Boolean,
      default: true
    },

    archived: {
      type: Boolean,
      default: false
    },

    relatedInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null
    },

    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model(
  "AdminEmailThread",
  adminEmailThreadSchema
)
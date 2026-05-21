import mongoose from "mongoose"

const emailAttachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 }
  },
  { _id: false }
)

const adminEmailSchema = new mongoose.Schema(
  {
    to: { type: String, default: "", trim: true, lowercase: true },
    cc: { type: String, default: "" },
    bcc: { type: String, default: "" },

    subject: { type: String, default: "", trim: true },
    message: { type: String, default: "" },
    html: { type: String, default: "" },

    attachments: {
      type: [emailAttachmentSchema],
      default: []
    },

    status: {
      type: String,
      enum: ["draft", "queued", "sent", "failed", "archived"],
      default: "draft"
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
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null
    },

    customerName: { type: String, default: "" },
    createdBy: { type: String, default: "admin@signavistudio.store" },

    archived: { type: Boolean, default: false },
    sentAt: { type: Date, default: null }
  },
  { timestamps: true }
)

export default mongoose.model("AdminEmail", adminEmailSchema)
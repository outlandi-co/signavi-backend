import mongoose from "mongoose"

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    url: { type: String, default: "" }
  },
  { _id: false }
)

const adminEmailMessageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminEmailThread",
      required: true
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true
    },

    senderEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    senderName: {
      type: String,
      default: ""
    },

    to: {
      type: String,
      default: ""
    },

    subject: {
      type: String,
      default: ""
    },

    message: {
      type: String,
      required: true
    },

    html: {
      type: String,
      default: ""
    },

    attachments: {
      type: [attachmentSchema],
      default: []
    },

    read: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
)

export default mongoose.model(
  "AdminEmailMessage",
  adminEmailMessageSchema
)
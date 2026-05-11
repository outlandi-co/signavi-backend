import mongoose from "mongoose"

const replySchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer"
    },

    message: {
      type: String,
      required: true
    },

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
)

const supportTicketSchema = new mongoose.Schema(
  {
    customerName: String,

    email: String,

    subject: String,

    message: String,

    orderNumber: String,

    status: {
      type: String,
      enum: ["open", "pending", "resolved", "closed"],
      default: "open"
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    },

    archived: {
      type: Boolean,
      default: false
    },

    unreadAdminCount: {
      type: Number,
      default: 1
    },

    unreadCustomerCount: {
      type: Number,
      default: 0
    },

    lastMessage: {
      type: String,
      default: ""
    },

    lastMessageAt: {
      type: Date,
      default: Date.now
    },

    closedAt: Date,

    archivedAt: Date,

    replies: [replySchema]
  },
  {
    timestamps: true
  }
)

export default mongoose.model("SupportTicket", supportTicketSchema)
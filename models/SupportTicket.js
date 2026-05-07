import mongoose from "mongoose"

const replySchema =
  new mongoose.Schema(

    {
      sender: {

        type: String,

        enum: [
          "customer",
          "admin"
        ],

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

const supportTicketSchema =
  new mongoose.Schema(

    {
      customerName: String,

      email: String,

      subject: String,

      message: String,

      orderNumber: String,

      status: {

        type: String,

        enum: [
          "open",
          "pending",
          "resolved"
        ],

        default: "open"
      },

      priority: {

        type: String,

        enum: [
          "low",
          "medium",
          "high"
        ],

        default: "medium"
      },

      archived: {

        type: Boolean,

        default: false
      },

      replies: [replySchema]
    },

    {
      timestamps: true
    }
  )

export default mongoose.model(
  "SupportTicket",
  supportTicketSchema
)
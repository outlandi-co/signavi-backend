import mongoose from "mongoose"

const notificationSchema = new mongoose.Schema({

  userEmail: {
    type: String,
    required: true
  },

  text: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: ["order", "payment", "system", "admin"],
    default: "system"
  },

  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order"
  },

  read: {
    type: Boolean,
    default: false
  }

}, { timestamps: true })

export default mongoose.model("Notification", notificationSchema)
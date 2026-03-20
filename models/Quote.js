import mongoose from "mongoose"

const quoteSchema = new mongoose.Schema({

  customerName: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true
  },

  quantity: {
    type: Number,
    default: 1
  },

  printType: {
    type: String,
    default: "screenprint"
  },

  notes: {
    type: String,
    default: ""
  },

  artwork: {
    type: String,
    default: null
  },

  /* 🔥 FULL PIPELINE */
  status: {
    type: String,
    enum: [
      "pending",
      "printing",
      "ready",
      "shipping",
      "shipped",
      "delivered"
    ],
    default: "pending"
  },

  trackingNumber: {
    type: String,
    default: ""
  },

  type: {
    type: String,
    default: "quote"
  }

}, { timestamps: true })

export default mongoose.model("Quote", quoteSchema)
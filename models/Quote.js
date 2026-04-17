import mongoose from "mongoose"

const quoteSchema = new mongoose.Schema({

  customerName: String,
  email: String,
  quantity: Number,
  price: Number,

  artwork: String,
  notes: String,

  /* 🔥 NEW APPROVAL SYSTEM */
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "denied"],
    default: "pending"
  },

  denialReason: String,

  revisionFee: {
    type: Number,
    default: 0
  },

  adminNotes: String

}, { timestamps: true })

export default mongoose.model("Quote", quoteSchema)
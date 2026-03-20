import mongoose from "mongoose"

const quoteSchema = new mongoose.Schema({
  customerName: { type: String, default: "Unknown" },
  email: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  printType: { type: String, default: "custom" },
  artwork: { type: String, default: null },

  price: { type: Number, default: 0 },
  cleanupFee: { type: Number, default: 0 },
  adminNotes: { type: String, default: "" },

  status: { type: String, default: "pending" },
  trackingNumber: { type: String, default: "" }

}, { timestamps: true })

export default mongoose.model("Quote", quoteSchema)
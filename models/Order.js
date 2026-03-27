import mongoose from "mongoose"

const orderSchema = new mongoose.Schema({

  customerName: { type: String, default: "Unknown" },
  email: { type: String, default: "" },

  quantity: { type: Number, default: 1 },
  printType: { type: String, default: "screenprint" },
  artwork: { type: String, default: null },

  price: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },

  source: {
    type: String,
    enum: ["store", "quote"],
    default: "store"
  },

  status: {
    type: String,
    enum: [
      "pending",
      "payment_required",
      "paid",
      "printing",
      "ready",
      "shipped",
      "denied"
    ],
    default: "pending"
  },

  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },

  timeline: [
    {
      status: String,
      date: { type: Date, default: Date.now },
      note: String
    }
  ]

}, { timestamps: true })

export default mongoose.model("Order", orderSchema)
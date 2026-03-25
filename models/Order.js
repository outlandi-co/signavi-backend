import mongoose from "mongoose"

const orderSchema = new mongoose.Schema({

  customerName: { type: String, default: "Store Order" },
  email: { type: String, default: "" },
  message: { type: String, default: "" },

  shippingAddress: {
    name: String,
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },

  quantity: { type: Number, default: 1 },
  items: { type: Array, default: [] },

  source: {
    type: String,
    enum: ["quote", "store"],
    default: "store"
  },

  price: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },

  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "denied"],
    default: "pending"
  },

  artwork: { type: String, default: null },

  /* 🔥 FIXED STATUS ENUM */
  status: {
    type: String,
    enum: [
      "pending",
      "approved",
      "artwork_sent", // ✅ needed for email approval
      "printing",
      "ready",        // ✅ needed for production flow
      "shipping",
      "shipped",
      "denied",
      "paid"          // ✅ needed for payment confirmation
    ],
    default: "pending"
  },

  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },
  shippedAt: Date,

  timeline: [
    {
      status: String,
      note: String,
      date: { type: Date, default: Date.now }
    }
  ]

}, { timestamps: true })

export default mongoose.model("Order", orderSchema)
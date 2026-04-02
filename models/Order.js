import mongoose from "mongoose"

const orderSchema = new mongoose.Schema({

  /* ================= CUSTOMER ================= */
  customerName: { type: String, default: "Unknown" },
  email: { type: String, default: "" },

  /* ================= ORDER ================= */
  quantity: { type: Number, default: 1 },
  printType: { type: String, default: "screenprint" },
  artwork: { type: String, default: null },

  /* ================= PRICING ================= */
  price: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },

  /* 🔥 INVOICE ITEMS */
  items: {
    type: [
      {
        name: { type: String, default: "" },
        quantity: { type: Number, default: 1 },
        price: { type: Number, default: 0 }
      }
    ],
    default: []
  },

  /* ================= SOURCE ================= */
  source: {
    type: String,
    enum: ["store", "quote"],
    default: "store"
  },

  /* ================= STATUS ================= */
  status: {
  type: String,
  enum: [
    "pending",
    "payment_required",
    "paid",
    "printing",
    "ready",
    "shipping",
    "shipped",
    "delivered", // 🔥 NEW
    "archive",
    "denied"
  ],
  default: "pending"
},

  /* ================= SHIPPING ================= */
  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },
  shippingLabel: { type: String, default: "" }, // 🔥 NEW

  /* ================= TIMELINE ================= */
  timeline: {
    type: [
      {
        status: String,
        date: { type: Date, default: Date.now },
        note: String
      }
    ],
    default: []
  }

}, { timestamps: true })

export default mongoose.model("Order", orderSchema)
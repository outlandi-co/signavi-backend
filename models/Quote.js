import mongoose from "mongoose"

const quoteSchema = new mongoose.Schema({

  customerName: { type: String, default: "New Customer" },
  email: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 25 },

  /* 🔥 NEW: SHIPPING */
  shippingCost: {
    type: Number,
    default: 0,
    min: 0
  },

  items: [
    {
      name: String,
      quantity: Number,
      price: Number
    }
  ],

  artwork: String,
  notes: String,

  paymentUrl: { type: String, default: null },

  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "denied"],
    default: "pending"
  },

  denialReason: String,
  revisionFee: { type: Number, default: 0 },
  adminNotes: String,

  status: {
    type: String,
    enum: [
      "quotes",
      "pending",
      "payment_required",
      "paid",
      "production",
      "shipping",
      "shipped",
      "delivered",
      "denied",
      "archive"
    ],
    default: "quotes"
  },

  source: {
    type: String,
    enum: ["quote", "order"],
    default: "quote"
  },

  lowQuality: {
    type: Boolean,
    default: false
  },

  timeline: [
    {
      status: String,
      date: {
        type: Date,
        default: Date.now
      },
      note: String
    }
  ]

}, { timestamps: true })

export default mongoose.model("Quote", quoteSchema)
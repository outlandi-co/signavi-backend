import mongoose from "mongoose"

/* ================= ITEM SCHEMA ================= */
const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    default: "",
    trim: true
  },

  quantity: {
    type: Number,
    default: 1,
    min: 1
  },

  price: {
    type: Number,
    default: 0,
    min: 0
  },

  /* 🔥 VARIANT */
  variant: {
    color: {
      type: String,
      default: "",
      lowercase: true,
      trim: true
    },
    size: {
      type: String,
      default: "",
      uppercase: true,
      trim: true
    }
  }

}, { _id: false })


/* ================= ORDER SCHEMA ================= */
const orderSchema = new mongoose.Schema({

  /* ================= USER ================= */
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true
  },

  /* ================= CUSTOMER ================= */
  customerName: {
    type: String,
    default: "Unknown",
    trim: true
  },

  email: {
    type: String,
    default: "",
    lowercase: true,
    trim: true,
    index: true // 🔥 IMPORTANT FOR FAST LOOKUP
  },

  /* ================= ORDER ================= */
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },

  printType: {
    type: String,
    default: "screenprint"
  },

  artwork: {
    type: String,
    default: null
  },

  /* ================= PRICING ================= */
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },

  tax: {
    type: Number,
    default: 0,
    min: 0
  },

  price: {
    type: Number,
    default: 0,
    min: 0
  },

  finalPrice: {
    type: Number,
    default: 0,
    min: 0
  },

  /* 🔥 ITEMS */
  items: {
    type: [itemSchema],
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
      "production",
      "shipping",
      "shipped",
      "delivered",
      "archive",
      "denied"
    ],
    default: "payment_required", // 🔥 BETTER DEFAULT
    index: true
  },

  /* ================= SHIPPING ================= */
  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },
  shippingLabel: { type: String, default: "" },

  weight: { type: Number, default: 1 },
  length: { type: Number, default: 10 },
  width: { type: Number, default: 8 },
  height: { type: Number, default: 2 },

  carrier: { type: String, default: "USPS" },
  serviceLevel: { type: String, default: "Ground Advantage" },

  /* ================= TIMELINE ================= */
  timeline: {
    type: [
      {
        status: String,
        date: {
          type: Date,
          default: Date.now
        },
        note: String
      }
    ],
    default: []
  },

  /* ================= PAYMENT ================= */
  stripePaymentIntentId: { type: String, default: "" },
  stripeSessionId: { type: String, default: "" },
  stripeChargeId: { type: String, default: "" },

  paymentUrl: {
    type: String,
    default: ""
  },

  /* ================= FINANCE ================= */
  currency: {
    type: String,
    default: "usd"
  },

  amountReceived: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },
  stripeFee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  cogs: { type: Number, default: 0 }

}, {
  timestamps: true
})

/* ================= INDEXES (🔥 BIG PERFORMANCE BOOST) ================= */
orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ email: 1, createdAt: -1 })
orderSchema.index({ status: 1 })

export default mongoose.model("Order", orderSchema)
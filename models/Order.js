import mongoose from "mongoose"

/* ================= ITEM SCHEMA ================= */
const itemSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0, min: 0 },

  variant: {
    color: { type: String, default: "", lowercase: true, trim: true },
    size: { type: String, default: "", uppercase: true, trim: true }
  }
}, { _id: false })

/* ================= ORDER SCHEMA ================= */
const orderSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true
  },

  customerName: { type: String, default: "Unknown", trim: true },

  email: {
    type: String,
    default: "",
    lowercase: true,
    trim: true,
    index: true
  },

  quantity: { type: Number, default: 1, min: 1 },
  printType: { type: String, default: "screenprint" },
  artwork: { type: String, default: null },

  /* ================= PRICING ================= */
  subtotal: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  price: { type: Number, default: 0, min: 0 },
  finalPrice: { type: Number, default: 0, min: 0 },

  items: { type: [itemSchema], default: [] },

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
    default: "payment_required"
    // ❌ removed index:true here
  },

  /* ================= SHIPPING ================= */
  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },
  shippingLabel: { type: String, default: "" },

  // 🔥 OPTIONAL (recommended for your checkout flow)
  shippingAddress: {
    name: String,
    street1: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },

  shippingCost: { type: Number, default: 0 },

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
        date: { type: Date, default: Date.now },
        note: String
      }
    ],
    default: []
  },

  /* ================= PAYMENT ================= */
  stripePaymentIntentId: { type: String, default: "" },
  stripeSessionId: { type: String, default: "" },
  stripeChargeId: { type: String, default: "" },

  paymentUrl: { type: String, default: "" },

  currency: { type: String, default: "usd" },
  amountReceived: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },
  stripeFee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  cogs: { type: Number, default: 0 }

}, { timestamps: true })

/* ================= INDEXES ================= */
orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ email: 1, createdAt: -1 })
orderSchema.index({ status: 1 }) // ✅ keep only this

export default mongoose.model("Order", orderSchema)
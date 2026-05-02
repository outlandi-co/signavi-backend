import mongoose from "mongoose"

/* ================= ITEM SCHEMA ================= */
const itemSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0, min: 0 },

  // 🔥 REAL COST SUPPORT
  cost: { type: Number, default: 0, min: 0 },

  variant: {
    color: { type: String, default: "", lowercase: true, trim: true },
    size: { type: String, default: "", uppercase: true, trim: true }
  }
}, { _id: false })

/* ================= ARTWORK SCHEMA ================= */
const artworkSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  path: { type: String, required: true }, // uploads/file.ext
  mimetype: { type: String, default: "" },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now }
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

  /* ================= CORE ================= */
  quantity: { type: Number, default: 1, min: 1 },
  printType: { type: String, default: "screenprint" },

  // 🔥 OLD (keep for backward compatibility)
  artwork: { type: String, default: null },

  // 🔥 NEW MULTI-FILE SYSTEM
  artworks: { type: [artworkSchema], default: [] },

  /* ================= PRICING ================= */
  subtotal: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  price: { type: Number, default: 0, min: 0 },
  finalPrice: { type: Number, default: 0, min: 0 },

  /* ================= PROFIT ENGINE ================= */
  cogs: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },

  items: { type: [itemSchema], default: [] },

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
      "ready_for_production",
      "paid",
      "production",
      "shipping",
      "shipped",
      "delivered",
      "archive",
      "denied"
    ],
    default: "payment_required"
  },

  /* ================= SHIPPING ================= */
  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },
  shippingLabel: { type: String, default: "" },

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
  squarePaymentId: { type: String, default: "" },
  squareOrderId: { type: String, default: "" },

  paymentUrl: { type: String, default: "" },

  currency: { type: String, default: "usd" },

  amountReceived: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },

  /* ================= FEES ================= */
  processingFee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 }

}, { timestamps: true })

/* =========================================================
   🔥 AUTO PROFIT + SMART COGS ENGINE
========================================================= */
orderSchema.pre("save", function () {

  const subtotal = this.subtotal || this.finalPrice || 0

  /* ================= AUTO COGS ================= */
  if (!this.cogs || this.cogs === 0) {
    this.cogs = (this.items || []).reduce((sum, item) => {

      if (item.cost && item.cost > 0) {
        return sum + (item.cost * item.quantity)
      }

      const estimatedCost = item.price * 0.4
      return sum + (estimatedCost * item.quantity)

    }, 0)
  }

  /* ================= PROFIT ================= */
  this.profit = subtotal - this.cogs

  /* ================= MARGIN ================= */
  this.margin = subtotal > 0
    ? (this.profit / subtotal) * 100
    : 0

  /* ================= NET ================= */
  this.netAmount = subtotal - (this.processingFee || 0)

  /* ================= CLEAN ================= */
  this.cogs = Number(this.cogs.toFixed(2))
  this.profit = Number(this.profit.toFixed(2))
  this.margin = Number(this.margin.toFixed(2))
  this.netAmount = Number(this.netAmount.toFixed(2))
})

/* ================= INDEXES ================= */
orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ email: 1, createdAt: -1 })
orderSchema.index({ status: 1 })

export default mongoose.model("Order", orderSchema)
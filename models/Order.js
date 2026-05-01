import mongoose from "mongoose"

/* ================= ITEM SCHEMA ================= */
const itemSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0, min: 0 },

  // 🔥 OPTIONAL (for real profit accuracy)
  cost: { type: Number, default: 0, min: 0 },

  variant: {
    color: { type: String, default: "", lowercase: true, trim: true },
    size: { type: String, default: "", uppercase: true, trim: true }
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
  artwork: { type: String, default: null },

  /* ================= PRICING ================= */
  subtotal: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  price: { type: Number, default: 0, min: 0 },
  finalPrice: { type: Number, default: 0, min: 0 },

  /* ================= PROFIT ================= */
  cogs: { type: Number, default: 0 },     // cost of goods
  profit: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },

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

  // 🔥 SQUARE ONLY
  squarePaymentId: { type: String, default: "" },
  squareOrderId: { type: String, default: "" },

  paymentUrl: { type: String, default: "" },

  currency: { type: String, default: "usd" },

  amountReceived: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },

  processingFee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 }

}, { timestamps: true })

/* =========================================================
   🔥 SMART PROFIT ENGINE
========================================================= */
orderSchema.pre("save", function (next) {

  const total = this.finalPrice || 0

  /* ================= ITEM COST (BEST CASE) ================= */
  if (this.items && this.items.length > 0) {
    const itemCost = this.items.reduce((sum, item) => {
      return sum + (Number(item.cost || 0) * Number(item.quantity || 1))
    }, 0)

    if (itemCost > 0) {
      this.cogs = itemCost
    }
  }

  /* ================= FALLBACK ESTIMATE ================= */
  if (!this.cogs || this.cogs === 0) {
    this.cogs = total * 0.4 // 🔥 40% default cost
  }

  /* ================= FINAL CALCULATIONS ================= */
  this.profit = total - this.cogs

  this.margin = total > 0
    ? (this.profit / total) * 100
    : 0

  this.netAmount = total - (this.processingFee || 0)

  next()
})

/* ================= INDEXES ================= */
orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ email: 1, createdAt: -1 })
orderSchema.index({ status: 1 })

export default mongoose.model("Order", orderSchema)

import mongoose from "mongoose"

/* ================= ITEM SCHEMA ================= */
const itemSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0, min: 0 },
  cost: { type: Number, default: 0, min: 0 },

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

  /* ================= QUOTE LINK ================= */
  quoteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quote",
    default: null,
    index: true
  },

  /* ================= CORE ================= */
  quantity: { type: Number, default: 1, min: 1 },
  printType: { type: String, default: "screenprint" },

  /* ================= ARTWORK ================= */
  artworks: [
    {
      url: { type: String, required: true },
      public_id: { type: String, default: "" },
      filename: { type: String, default: "" }
    }
  ],

  /* 🔥 BACKWARD COMPATIBILITY (single artwork support) */
  artwork: { type: String, default: "" },

  /* ================= PRICING ================= */
  subtotal: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  finalPrice: { type: Number, default: 0, min: 0 },

  /* ================= PROFIT ================= */
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
      "quotes",
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
    default: "payment_required",
    index: true
  },

  /* ================= SHIPPING ================= */
  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },

  /* ================= TIMELINE ================= */
  timeline: {
    type: [
      {
        status: { type: String },
        date: { type: Date, default: Date.now },
        note: { type: String }
      }
    ],
    default: [] // 🔥 CRITICAL FIX
  },

  /* ================= PAYMENT ================= */
  paymentUrl: { type: String, default: "" },
  squarePaymentId: { type: String, default: "" },

  currency: { type: String, default: "usd" }

}, { timestamps: true })

/* =========================================================
   🔥 AUTO ENGINE (TOTALS + PROFIT + SAFETY)
========================================================= */
orderSchema.pre("save", function () {

  /* 🔥 AUTO CALCULATE SUBTOTAL FROM ITEMS */
  if (this.items?.length) {
    this.subtotal = this.items.reduce((sum, item) => {
      const price = Number(item.price || 0)
      const qty = Number(item.quantity || 1)
      return sum + (price * qty)
    }, 0)
  }

  /* TAX */
  this.tax = this.subtotal * 0.0825

  /* FINAL PRICE */
  this.finalPrice = this.subtotal + this.tax

  /* 🔥 ENSURE TIMELINE EXISTS */
  if (!this.timeline) {
    this.timeline = []
  }

  /* 🔥 INITIAL TIMELINE ENTRY */
  if (this.timeline.length === 0) {
    this.timeline.push({
      status: this.status,
      date: new Date()
    })
  }

  /* ================= PROFIT ================= */
  if (!this.cogs || this.cogs === 0) {
    this.cogs = (this.items || []).reduce((sum, item) => {

      if (item.cost && item.cost > 0) {
        return sum + (item.cost * item.quantity)
      }

      const estimatedCost = (item.price || 0) * 0.4
      return sum + (estimatedCost * (item.quantity || 1))

    }, 0)
  }

  this.profit = this.finalPrice - this.cogs

  this.margin = this.finalPrice > 0
    ? (this.profit / this.finalPrice) * 100
    : 0

  /* 🔥 CLEAN NUMBERS */
  this.cogs = Number(this.cogs.toFixed(2))
  this.profit = Number(this.profit.toFixed(2))
  this.margin = Number(this.margin.toFixed(2))
})

/* =========================================================
   ✅ SAFE EXPORT
========================================================= */
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema)

export default Order
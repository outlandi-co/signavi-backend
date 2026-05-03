import mongoose from "mongoose"

/* ================= ITEM SCHEMA ================= */
const itemSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0, min: 0 },

  // real cost tracking
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

  /* ================= CORE ================= */
  quantity: { type: Number, default: 1, min: 1 },
  printType: { type: String, default: "screenprint" },

  // 🔥 IMPORTANT: artwork storage (Cloudinary)
  artworks: {
    type: [
      {
        url: String,
        public_id: String,
        filename: String
      }
    ],
    default: []
  },

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
  paymentUrl: { type: String, default: "" },
  squarePaymentId: { type: String, default: "" },

  currency: { type: String, default: "usd" }

}, { timestamps: true })

/* =========================================================
   🔥 AUTO PROFIT ENGINE
========================================================= */
orderSchema.pre("save", function () {

  const subtotal = this.subtotal || this.finalPrice || 0

  // calculate COGS if not set
  if (!this.cogs || this.cogs === 0) {
    this.cogs = (this.items || []).reduce((sum, item) => {

      if (item.cost && item.cost > 0) {
        return sum + (item.cost * item.quantity)
      }

      const estimatedCost = item.price * 0.4
      return sum + (estimatedCost * item.quantity)

    }, 0)
  }

  this.profit = subtotal - this.cogs

  this.margin = subtotal > 0
    ? (this.profit / subtotal) * 100
    : 0

  // clean numbers
  this.cogs = Number(this.cogs.toFixed(2))
  this.profit = Number(this.profit.toFixed(2))
  this.margin = Number(this.margin.toFixed(2))
})

/* ================= INDEXES ================= */
orderSchema.index({ email: 1, createdAt: -1 })
orderSchema.index({ status: 1 })

/* =========================================================
   ✅ CRITICAL EXPORT (THIS FIXES YOUR ERROR)
========================================================= */
export default mongoose.model("Order", orderSchema)
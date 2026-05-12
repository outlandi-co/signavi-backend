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

  customerName: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },

  phone: {
    type: String,
    default: "",
    trim: true
  },

  address: {
    street: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    zip: { type: String, default: "", trim: true },
    country: { type: String, default: "US", trim: true }
  },

  quoteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quote",
    default: null,
    index: true
  },

  quantity: { type: Number, default: 1, min: 1 },
  printType: { type: String, default: "screenprint" },

  artworks: [
    {
      url: { type: String, required: true },
      public_id: { type: String, default: "" },
      filename: { type: String, default: "" }
    }
  ],

  artwork: { type: String, default: "" },

  subtotal: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  finalPrice: { type: Number, default: 0, min: 0 },

  cogs: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },

  items: { type: [itemSchema], default: [] },

  orderType: {
  type: String,
  enum: ["store", "custom"],
  default: "store",
  index: true
},

source: {
  type: String,
  enum: ["store", "quote", "admin", "custom"],
  default: "store"
},

paymentMethod: {
  type: String,
  default: "",
  trim: true
},

notes: {
  type: String,
  default: "",
  trim: true
},

shipping: {
  type: Number,
  default: 0,
  min: 0
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

  trackingNumber: { type: String, default: "" },
  trackingLink: { type: String, default: "" },

  timeline: {
    type: [
      {
        status: { type: String },
        date: { type: Date, default: Date.now },
        note: { type: String }
      }
    ],
    default: []
  },

  invoiceCreatedAt: {
  type: Date,
  default: null
},

receiptCreatedAt: {
  type: Date,
  default: null
},

paidAt: {
  type: Date,
  default: null
},

customQuotePaidAt: {
  type: Date,
  default: null
},

paymentUrlCreatedAt: {
  type: Date,
  default: null
},

  paymentUrl: { type: String, default: "" },
  squarePaymentId: { type: String, default: "" },

  currency: { type: String, default: "usd" }

}, { timestamps: true })

/* =========================================================
   AUTO ENGINE
========================================================= */
orderSchema.pre("save", function () {

  if (this.items?.length) {
    this.subtotal = this.items.reduce((sum, item) => {
      const price = Number(item.price || 0)
      const qty = Number(item.quantity || 1)
      return sum + (price * qty)
    }, 0)
  }

  this.tax = this.subtotal * 0.0825
 this.finalPrice = this.subtotal + this.tax + Number(this.shipping || 0)

  if (!this.timeline) {
    this.timeline = []
  }

  if (this.timeline.length === 0) {
    this.timeline.push({
      status: this.status,
      date: new Date()
    })
  }

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

  this.cogs = Number(this.cogs.toFixed(2))
  this.profit = Number(this.profit.toFixed(2))
  this.margin = Number(this.margin.toFixed(2))
})

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema)

export default Order
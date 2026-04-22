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
  subtotal: { type: Number, default: 0 }, // ✅ NEW
  tax: { type: Number, default: 0 },      // ✅ NEW
  price: { type: Number, default: 0 },    // total
  finalPrice: { type: Number, default: 0 },

  items: [
    {
      name: { type: String, default: "" },
      quantity: { type: Number, default: 1 },
      price: { type: Number, default: 0 }
    }
  ],

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
    default: "pending"
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
  timeline: [
    {
      status: String,
      date: { type: Date, default: Date.now },
      note: String
    }
  ],

  /* ================= STRIPE ================= */
  stripePaymentIntentId: { type: String, default: "" },
  stripeSessionId: { type: String, default: "" },
  stripeChargeId: { type: String, default: "" },

  /* ================= FINANCE ================= */
  currency: { type: String, default: "usd" },
  amountReceived: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },
  stripeFee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  cogs: { type: Number, default: 0 }

}, { timestamps: true })

export default mongoose.model("Order", orderSchema)
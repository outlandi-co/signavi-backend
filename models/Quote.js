import mongoose from "mongoose"

const quoteSchema = new mongoose.Schema({

  /* ================= CUSTOMER ================= */
  customerName: {
    type: String,
    default: "New Customer"
  },

  email: {
    type: String,
    default: ""
  },

  quantity: {
    type: Number,
    default: 1
  },

  price: {
    type: Number,
    default: 25
  },

  /* ================= ITEMS ================= */
  items: [
    {
      name: String,
      quantity: Number,
      price: Number
    }
  ],

  /* ================= FILE / NOTES ================= */
  artwork: String,
  notes: String,

  /* ================= PAYMENT ================= */
  paymentUrl: {
    type: String,
    default: null
  },

  /* ================= APPROVAL ================= */
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "denied"],
    default: "pending"
  },

  denialReason: String,

  revisionFee: {
    type: Number,
    default: 0
  },

  adminNotes: String,

  /* ================= WORKFLOW ================= */
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

  /* ================= TIMELINE ================= */
  timeline: [
    {
      status: String,
      date: Date,
      note: String
    }
  ]

}, { timestamps: true })

/* =========================================================
   🔥 PRE-SAVE WORKFLOW LOGIC (IMPROVED)
========================================================= */
quoteSchema.pre("save", function (next) {

  /* ================= APPROVED ================= */
  if (this.approvalStatus === "approved") {

    if (this.status !== "payment_required") {
      this.status = "payment_required"
      this.source = "order"

      this.timeline.push({
        status: "payment_required",
        date: new Date(),
        note: "Approved – awaiting payment"
      })
    }
  }

  /* ================= DENIED ================= */
  if (this.approvalStatus === "denied") {

    if (this.status !== "denied") {
      this.status = "denied"
      this.source = "quote"

      this.timeline.push({
        status: "denied",
        date: new Date(),
        note: this.denialReason || "Quote denied"
      })
    }
  }

  next()
})

export default mongoose.model("Quote", quoteSchema)
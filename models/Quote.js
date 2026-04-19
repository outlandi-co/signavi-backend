import mongoose from "mongoose"

const quoteSchema = new mongoose.Schema({

  customerName: String,
  email: String,
  quantity: Number,
  price: Number,

  artwork: String,
  notes: String,

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

  /* ================= 🔥 WORKFLOW FIELDS ================= */
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

  /* ================= OPTIONAL FLAGS ================= */
  lowQuality: {
    type: Boolean,
    default: false
  },

  timeline: [
    {
      status: String,
      date: Date,
      note: String
    }
  ]

}, { timestamps: true })

/* ================= 🔥 AUTO SYNC LOGIC ================= */
quoteSchema.pre("save", function (next) {

  // 🔥 Approval → Payment flow
  if (this.approvalStatus === "approved") {
    this.status = "payment_required"
    this.source = "order"
  }

  // 🔥 Denied → back to quotes
  if (this.approvalStatus === "denied") {
    this.status = "quotes"
    this.source = "quote"
  }

  next()
})

export default mongoose.model("Quote", quoteSchema)
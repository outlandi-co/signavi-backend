import mongoose from "mongoose"

const timelineSchema = new mongoose.Schema({
  status: String,
  note: String,
  date: {
    type: Date,
    default: Date.now
  }
})

const quoteSchema = new mongoose.Schema(
  {
    customerName: String,
    email: String,
    quantity: Number,
    price: Number,
    finalPrice: Number,

    artwork: String,
    notes: String,

    /* ================= APPROVAL ================= */
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending"
    },

    denialReason: String,
    adminNotes: String,

    /* ================= STATUS ================= */
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
      default: "quote"
    },

    timeline: [timelineSchema]
  },
  { timestamps: true }
)

export default mongoose.model("Quote", quoteSchema)
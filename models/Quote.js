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

    /* ================= WORKFLOW STATUS ================= */
    status: {
      type: String,
      enum: [
        "quotes",

        /* STEP 2 */
        "review_mockup",

        /* STEP 3 */
        "approval_payment",

        /* EXISTING PAYMENT STATES */
        "pending",
        "payment_required",
        "paid",

        /* STEP 4 */
        "production",

        /* STEP 5 */
        "pickup_shipping",

        /* EXISTING DELIVERY STATES */
        "shipping",
        "shipped",
        "delivered",

        /* OTHER */
        "completed",
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
import mongoose from "mongoose"

const timelineSchema = new mongoose.Schema({
  status: {
    type: String,
    default: ""
  },

  note: {
    type: String,
    default: ""
  },

  date: {
    type: Date,
    default: Date.now
  }
})

const quoteItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: ""
    },

    quantity: {
      type: Number,
      default: 1
    },

    price: {
      type: Number,
      default: 0
    },

    serviceType: {
      type: String,
      default: ""
    },

    source: {
      type: String,
      default: "quote"
    }
  },
  {
    _id: false
  }
)

const quoteSchema = new mongoose.Schema(
  {
    /* ================= CUSTOMER ================= */

    customerName: {
      type: String,
      default: ""
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      default: ""
    },

    /* ================= PROJECT ================= */

    projectType: {
      type: String,
      default: ""
    },

    serviceType: {
      type: String,
      default: ""
    },

    serviceLabel: {
      type: String,
      default: ""
    },

    printType: {
      type: String,
      default: ""
    },

    turnaround: {
      type: String,
      default: "standard"
    },

    notes: {
      type: String,
      default: ""
    },

    quantity: {
      type: Number,
      default: 1
    },

    items: {
      type: [quoteItemSchema],
      default: []
    },

    /* ================= PRICING ================= */

    price: {
      type: Number,
      default: 0
    },

    finalPrice: {
      type: Number,
      default: 0
    },

    shippingCost: {
      type: Number,
      default: 0
    },

    /* ================= ARTWORK ================= */

    artwork: {
      type: String,
      default: ""
    },

    artworkUrl: {
      type: String,
      default: ""
    },

    artworkPublicId: {
      type: String,
      default: ""
    },

    artworkName: {
      type: String,
      default: ""
    },

    /* ================= APPROVAL ================= */

    approvalStatus: {
      type: String,

      enum: [
        "pending",
        "approved",
        "denied"
      ],

      default: "pending"
    },

    denialReason: {
      type: String,
      default: ""
    },

    adminNotes: {
      type: String,
      default: ""
    },

    /* ================= WORKFLOW STATUS ================= */

    status: {
      type: String,

      enum: [
        /* STEP 1 */
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

        /* DELIVERY STATES */
        "shipping",
        "shipped",
        "delivered",

        /* FINISHED */
        "completed",

        /* OTHER */
        "denied",
        "archive"
      ],

      default: "quotes"
    },

    /* ================= ORDER CONNECTION ================= */

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },

    /* ================= SOURCE ================= */

    source: {
      type: String,
      default: "quote"
    },

    /* ================= HISTORY ================= */

    timeline: {
      type: [timelineSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model(
  "Quote",
  quoteSchema
)
import mongoose from "mongoose"

const timelineSchema = new mongoose.Schema(
  {
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
  },
  {
    _id: false
  }
)

const quoteItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: ""
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1
    },

    price: {
      type: Number,
      default: 0,
      min: 0
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
      default: "",
      trim: true
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      default: "",
      trim: true
    },

    /* ================= PROJECT ================= */

    projectType: {
      type: String,
      default: "",
      trim: true
    },

    serviceType: {
      type: String,
      default: "",
      trim: true
    },

    serviceLabel: {
      type: String,
      default: "",
      trim: true
    },

    printType: {
      type: String,
      default: "",
      trim: true
    },

    turnaround: {
      type: String,
      default: "standard",
      trim: true
    },

    notes: {
      type: String,
      default: ""
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1
    },

    items: {
      type: [quoteItemSchema],
      default: []
    },

    /* ================= PRICING ================= */

    price: {
      type: Number,
      default: 0,
      min: 0
    },

    finalPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    shippingCost: {
      type: Number,
      default: 0,
      min: 0
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

        /* PAYMENT STATES */
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
      default: "quote",
      trim: true
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

/* ================= INDEXES ================= */

quoteSchema.index({ email: 1 })

quoteSchema.index({ status: 1 })

quoteSchema.index({ approvalStatus: 1 })

quoteSchema.index({ createdAt: -1 })

quoteSchema.index({ orderId: 1 })

export default mongoose.model("Quote", quoteSchema)
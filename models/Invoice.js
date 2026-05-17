import mongoose from "mongoose"

const invoiceItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    price: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
)

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true
    },

    customerName: {
      type: String,
      required: true,
      trim: true
    },

    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },

    items: [invoiceItemSchema],

    subtotal: {
      type: Number,
      default: 0
    },

    tax: {
      type: Number,
      default: 0
    },

    shipping: {
      type: Number,
      default: 0
    },

    total: {
      type: Number,
      default: 0
    },

    notes: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: [
        "draft",
        "proof_uploaded",
        "proof_approved",
        "payment_required",
        "paid",
        "ready_for_production",
        "production",
        "completed",
        "cancelled"
      ],
      default: "draft"
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid"
    },

    paymentUrl: {
      type: String,
      default: ""
    },

    squareCheckoutId: {
      type: String,
      default: ""
    },

    paidAt: {
      type: Date,
      default: null
    },

    finalProof: {
      imageUrl: {
        type: String,
        default: ""
      },
      fileName: {
        type: String,
        default: ""
      },
      approved: {
        type: Boolean,
        default: false
      },
      approvedAt: {
        type: Date,
        default: null
      },
      approvalName: {
        type: String,
        default: ""
      },
      approvalEmail: {
        type: String,
        default: ""
      }
    }
  },
  { timestamps: true }
)

invoiceSchema.pre("save", function calculateTotals(next) {
  const subtotal = this.items.reduce((sum, item) => {
    return sum + item.quantity * item.price
  }, 0)

  this.subtotal = subtotal
  this.total = subtotal + this.tax + this.shipping

  if (!this.invoiceNumber) {
    this.invoiceNumber = `SIGNAVI-${Date.now()}`
  }

  next()
})

export default mongoose.model("Invoice", invoiceSchema)
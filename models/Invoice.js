import mongoose from "mongoose"

const TAX_RATE = 0.0825

const invoiceItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    price: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
)

const proofFileSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" }
  },
  { _id: false }
)

const timelineSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    date: { type: Date, default: Date.now }
  },
  { _id: false }
)

const shippingInfoSchema = new mongoose.Schema(
  {
    carrier: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null }
  },
  { _id: false }
)

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true, sparse: true },

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

    items: { type: [invoiceItemSchema], default: [] },

    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    notes: { type: String, default: "" },

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
        "shipped",
        "delivered",
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

    paymentUrl: { type: String, default: "" },
    squareCheckoutId: { type: String, default: "" },
    squarePaymentLinkId: { type: String, default: "" },
    squarePaymentId: { type: String, default: "" },
    paidAt: { type: Date, default: null },

    finalProof: {
      imageUrl: { type: String, default: "" },
      fileName: { type: String, default: "" },
      files: { type: [proofFileSchema], default: [] },
      approved: { type: Boolean, default: false },
      approvedAt: { type: Date, default: null },
      approvalName: { type: String, default: "" },
      approvalEmail: { type: String, default: "" }
    },

    shippingInfo: {
      type: shippingInfoSchema,
      default: () => ({})
    },

    timeline: {
      type: [timelineSchema],
      default: []
    }
  },
  { timestamps: true }
)

invoiceSchema.methods.addTimeline = function (status, note = "") {
  this.timeline.push({
    status,
    note,
    date: new Date()
  })
}

invoiceSchema.pre("save", function calculateTotals() {
  const subtotal = this.items.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.price || 0)
  }, 0)

  this.subtotal = Number(subtotal.toFixed(2))
  this.tax = Number((subtotal * TAX_RATE).toFixed(2))
  this.shipping = Number(this.shipping || 0)

  this.total = Number(
    (this.subtotal + this.tax + this.shipping).toFixed(2)
  )

  if (!this.invoiceNumber) {
    this.invoiceNumber = `SIGNAVI-${Date.now()}`
  }

  if (this.isNew && this.timeline.length === 0) {
    this.timeline.push({
      status: "draft",
      note: "Invoice created",
      date: new Date()
    })
  }
})

const Invoice =
  mongoose.models.Invoice ||
  mongoose.model("Invoice", invoiceSchema)

export default Invoice
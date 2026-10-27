import mongoose from "mongoose"

// Sandbox-only durable association schema.
// This model does not create, authorize, or reconcile payments.
// Linking must eventually enforce payment evidence and lock ownership.
const schema = new mongoose.Schema({
  environment: {
    type: String,
    enum: ["sandbox"],
    required: true,
    immutable: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  purchaseKey: {
    type: String,
    required: true,
    immutable: true,
    match: /^order:[0-9a-f]{24}$/
  },
  amountCents: {
    type: Number,
    required: true,
    min: 1,
    immutable: true
  }
}, {
  timestamps: true,
  collection: "smart_shipping_v3_invoice_order_associations"
})

schema.pre("validate", function () {
  if (this.orderId && this.purchaseKey !==
      `order:${String(this.orderId).toLowerCase()}`) {
    this.invalidate(
      "purchaseKey",
      "Purchase key must match the associated order."
    )
  }
})

schema.index(
  { environment: 1, invoiceId: 1 },
  { unique: true }
)

schema.index(
  { environment: 1, orderId: 1 },
  { unique: true }
)

schema.index(
  { environment: 1, purchaseKey: 1 },
  { unique: true }
)

export default (
  mongoose.models.SmartShippingV3InvoiceOrderAssociation ||
  mongoose.model(
    "SmartShippingV3InvoiceOrderAssociation",
    schema
  )
)
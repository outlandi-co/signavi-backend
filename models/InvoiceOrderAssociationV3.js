import mongoose from "mongoose"

// Experimental isolated-test model.
// Not wired into checkout, invoice routes, or Square.
const schema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  environment: {
    type: String,
    enum: ["sandbox"],
    required: true
  },
  purchaseKey: {
    type: String,
    required: true
  },
  amountCents: {
    type: Number,
    min: 1,
    required: true
  }
}, {
  timestamps: true,
  collection: "invoice_order_associations_v3_test"
})

schema.index(
  { environment: 1, invoiceId: 1 },
  { unique: true }
)

schema.index(
  { environment: 1, orderId: 1 },
  { unique: true }
)

export default (
  mongoose.models.InvoiceOrderAssociationV3 ||
  mongoose.model("InvoiceOrderAssociationV3", schema)
)
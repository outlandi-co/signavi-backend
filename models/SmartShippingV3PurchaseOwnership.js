import mongoose from "mongoose"

// Durable sandbox ownership schema.
// No payment execution, Square authorization or external calls.
// Do not use in production payment flows without further integration.
const schema = new mongoose.Schema({
  environment: {
    type: String,
    enum: ["sandbox"],
    required: true,
    immutable: true
  },
  purchaseKey: {
    type: String,
    required: true,
    immutable: true,
    match: /^order:[0-9a-f]{24}$/
  },
  claimedByDocumentType: {
    type: String,
    enum: ["order", "invoice"],
    required: true,
    immutable: true
  },
  claimedByDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  status: {
    type: String,
    enum: ["reconciliation_required", "completed"],
    default: "reconciliation_required",
    required: true
  }
}, {
  timestamps: true,
  collection: "smart_shipping_v3_purchase_ownership"
})

schema.index(
  { environment: 1, purchaseKey: 1 },
  { unique: true }
)

schema.index(
  {
    environment: 1,
    claimedByDocumentType: 1,
    claimedByDocumentId: 1
  },
  { unique: true }
)

export default (
  mongoose.models.SmartShippingV3PurchaseOwnership ||
  mongoose.model("SmartShippingV3PurchaseOwnership", schema)
)
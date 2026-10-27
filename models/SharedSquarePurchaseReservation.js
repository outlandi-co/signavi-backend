import mongoose from "mongoose"

// Isolated experimental model. Not connected to payment routes.
const schema = new mongoose.Schema({
  environment: {
    type: String,
    enum: ["sandbox", "production"],
    required: true
  },
  purchaseKey: {
    type: String,
    required: true
  },
  claimedByDocumentType: {
    type: String,
    enum: ["order", "invoice"],
    required: true
  },
  claimedByDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  status: {
    type: String,
    enum: ["reconciliation_required", "completed"],
    default: "reconciliation_required"
  }
}, {
  timestamps: true,
  collection: "shared_square_purchase_reservations_test"
})

schema.index(
  { environment: 1, purchaseKey: 1 },
  { unique: true }
)

export default (
  mongoose.models.SharedSquarePurchaseReservation ||
  mongoose.model("SharedSquarePurchaseReservation", schema)
)
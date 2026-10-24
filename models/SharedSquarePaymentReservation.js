import mongoose from "mongoose"

const schema = new mongoose.Schema({
  documentType: {
    type: String,
    required: true,
    enum: ["order", "invoice"]
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  environment: {
    type: String,
    required: true,
    enum: ["sandbox", "production"]
  },
  amountCents: {
    type: Number,
    required: true,
    min: 1
  },
  owner: {
    type: String,
    required: true
  },
  idempotencyKey: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["reconciliation_required", "completed"],
    default: "reconciliation_required"
  },
  attemptClaimedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: "shared_square_payment_reservations"
})

schema.index(
  {
    documentType: 1,
    documentId: 1,
    environment: 1
  },
  { unique: true }
)

schema.index(
  {
    environment: 1,
    idempotencyKey: 1
  },
  { unique: true }
)

const SharedSquarePaymentReservation =
  mongoose.models.SharedSquarePaymentReservation ||
  mongoose.model("SharedSquarePaymentReservation", schema)

export default SharedSquarePaymentReservation
import mongoose from "mongoose"

const schema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  environment: {
    type: String,
    required: true,
    enum: ["sandbox", "production"]
  },
  owner: {
    type: String,
    required: true,
    trim: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    trim: true
  },
  amountCents: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    required: true,
    enum: [
      "reserved",
      "reconciliation_required",
      "completed"
    ],
    default: "reserved"
  },
  squarePaymentLinkId: {
    type: String,
    default: ""
  },
  squareOrderId: {
    type: String,
    default: ""
  },
  paymentUrl: {
    type: String,
    default: ""
  }
}, {
  timestamps: true,
  collection: "square_payment_creation_reservations"
})

schema.index(
  { orderId: 1, environment: 1 },
  { unique: true }
)

schema.index(
  { environment: 1, idempotencyKey: 1 },
  { unique: true }
)

const SquarePaymentCreationReservation =
  mongoose.models.SquarePaymentCreationReservation ||
  mongoose.model(
    "SquarePaymentCreationReservation",
    schema
  )

export default SquarePaymentCreationReservation
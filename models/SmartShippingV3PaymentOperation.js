import mongoose from "mongoose"

const schema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true
  },
  amountCents: {
    type: Number,
    required: true,
    min: 1
  },
  environment: {
    type: String,
    enum: ["sandbox"],
    required: true
  },
  status: {
    type: String,
    enum: [
      "pending",
      "completed",
      "reconciliation_required"
    ],
    default: "pending",
    required: true
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
  },
  lastError: {
    type: String,
    default: ""
  }
}, {
  timestamps: true,
  collection: "smart_shipping_v3_payment_operations"
})

schema.index({ status: 1, updatedAt: 1 })

const SmartShippingV3PaymentOperation =
  mongoose.models.SmartShippingV3PaymentOperation ||
  mongoose.model(
    "SmartShippingV3PaymentOperation",
    schema
  )

export default SmartShippingV3PaymentOperation
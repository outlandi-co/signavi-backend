import mongoose from "mongoose"

const { Schema } = mongoose

const schema = new Schema(
  {
    environment: {
      type: String,
      required: true,
      enum: ["production"],
      immutable: true
    },

    orderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true
    },

    purchaseKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      match: /^signavi-v3-production-purchase-[0-9a-f]{24}$/
    },

    claimedByDocumentType: {
      type: String,
      required: true,
      enum: ["order", "invoice"],
      immutable: true
    },

    claimedByDocumentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true
    },

    status: {
      type: String,
      required: true,
      enum: [
        "reserved",
        "claim_pending",
        "reconciliation_required",
        "completed"
      ],
      default: "reserved"
    },

    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      match: /^signavi-v3-production-[a-z0-9-]+$/
    },

    attemptClaimedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    strict: "throw",
    collection: "smart_shipping_v3_production_purchase_reservations"
  }
)

// Database-enforced canonical purchase ownership.
// Both order and invoice workflows must resolve to this same key.
schema.index(
  { environment: 1, purchaseKey: 1 },
  { unique: true, name: "unique_production_v3_purchase" }
)

// An order cannot own two separate purchase reservations.
schema.index(
  { environment: 1, orderId: 1 },
  { unique: true, name: "unique_production_v3_order" }
)

// Prevent reuse of a Square payment idempotency identity.
schema.index(
  { environment: 1, idempotencyKey: 1 },
  { unique: true, name: "unique_production_v3_idempotency" }
)

export default mongoose.models.SmartShippingV3ProductionPurchaseReservation ||
  mongoose.model(
    "SmartShippingV3ProductionPurchaseReservation",
    schema
  )

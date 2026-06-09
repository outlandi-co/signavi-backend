import mongoose from "mongoose"

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier"
    },

    supplierName: {
      type: String,
      required: true
    },

    materialId: {
      type: String,
      default: ""
    },

    materialName: {
      type: String,
      required: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    unitCost: {
      type: Number,
      default: 0
    },

    totalCost: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      enum: [
        "draft",
        "submitted",
        "ordered",
        "received",
        "cancelled"
      ],
      default: "draft"
    },

    expectedArrival: {
      type: Date
    },

    notes: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model(
  "PurchaseOrder",
  purchaseOrderSchema
)
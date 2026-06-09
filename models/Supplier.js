import mongoose from "mongoose"

const supplierSchema = new mongoose.Schema(
  {
    supplierId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    website: {
      type: String,
      default: ""
    },

    email: {
      type: String,
      default: ""
    },

    phone: {
      type: String,
      default: ""
    },

    leadTime: {
      type: String,
      default: ""
    },

    shippingNotes: {
      type: String,
      default: ""
    },

    notes: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: [
        "active",
        "inactive",
        "preferred"
      ],
      default: "active"
    },

    lastContacted: {
      type: Date
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model(
  "Supplier",
  supplierSchema
)
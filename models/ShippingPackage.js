import mongoose from "mongoose"

const shippingPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    carrier: {
      type: String,
      enum: ["USPS", "UPS", "FedEx", "Generic"],
      default: "Generic"
    },

    type: {
      type: String,
      enum: [
        "mailer",
        "box",
        "fragile",
        "oversized",
        "custom"
      ],
      required: true
    },

    lengthIn: {
      type: Number,
      required: true,
      min: 0
    },

    widthIn: {
      type: Number,
      required: true,
      min: 0
    },

    heightIn: {
      type: Number,
      required: true,
      min: 0
    },

    tareWeightOz: {
      type: Number,
      default: 0,
      min: 0
    },

    maxWeightOz: {
      type: Number,
      required: true,
      min: 0
    },

    clearanceIn: {
      type: Number,
      default: 0,
      min: 0
    },

    uspsFlatRate: {
      type: Boolean,
      default: false
    },

    shippoParcelTemplate: {
      type: String,
      default: "",
      trim: true
    },

    verifiedShirtCapacity: {
      type: Number,
      default: null,
      min: 1
    },

    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.models.ShippingPackage ||
  mongoose.model("ShippingPackage", shippingPackageSchema)

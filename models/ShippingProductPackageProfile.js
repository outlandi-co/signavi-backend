import mongoose from "mongoose"

const schema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ShippingPackage",
    required: true
  },

  // Measured product weight only.
  // Packaging tare is stored separately in ShippingPackage.
  unitWeightOz: {
    type: Number,
    required: true,
    min: 0.01,
    max: 2400
  },

  // Physically verified quantity that fits this package.
  verifiedCapacity: {
    type: Number,
    required: true,
    min: 1,
    max: 200,
    validate: {
      validator: Number.isSafeInteger,
      message: "Verified capacity must be an integer."
    }
  },

  verifiedBy: {
    type: String,
    required: true,
    trim: true
  },

  verifiedAt: {
    type: Date,
    required: true
  },

  verificationNotes: {
    type: String,
    required: true,
    trim: true,
    minlength: 8
  },

  active: {
    type: Boolean,
    default: false
  }
}, { timestamps: true, autoIndex: false, autoCreate: false })

schema.index(
  { productId: 1, packageId: 1 },
  { unique: true }
)

export default mongoose.models.ShippingProductPackageProfile ||
  mongoose.model("ShippingProductPackageProfile", schema)

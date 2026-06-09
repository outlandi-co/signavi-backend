import mongoose from "mongoose"

const colorSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    hex: { type: String, required: true, trim: true },
    stock: { type: Number, default: 0 }
  },
  { _id: false }
)

const materialSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },

    brand: { type: String, required: true },
    productName: { type: String, required: true },
    fullName: { type: String, required: true },

    category: { type: String, required: true },
    materialType: { type: String },
    unit: { type: String, default: "yard" },
    skuPrefix: { type: String },

    price: { type: Number, required: true },
    regularPrice: { type: Number },
    currency: { type: String, default: "USD" },

    dimensions: {
      listedWidth: String,
      actualWidth: String,
      lengthPerUnit: String,
      thickness: String
    },

    specs: {
      composition: String,
      backing: String,
      finish: String,
      blade: String,
      certification: String
    },

    adheresTo: [String],
    applicationInstructions: [String],
    careInstructions: [String],
    recommendedAccessories: [String],

    source: {
      supplierId: String,
      vendor: String,
      url: String,
      lastChecked: String
    },

    priceWatch: {
      enabled: { type: Boolean, default: false },
      currentPrice: Number,
      previousPrice: Number,
      alertOnChange: { type: Boolean, default: true },
      lastChecked: Date
    },

    inventory: {
      trackInventory: { type: Boolean, default: true },
      reorderPoint: { type: Number, default: 5 },
      quantityOnHand: { type: Number, default: 0 }
    },

    colors: [colorSchema],

    active: { type: Boolean, default: true }
  },
  { timestamps: true }
)

export default mongoose.model("Material", materialSchema)
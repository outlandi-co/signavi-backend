import mongoose from "mongoose"

const productSchema = new mongoose.Schema({

  vendor: {
    type: String,
    default: "",
    trim: true
  },

  vendors: {
    type: [String],
    default: []
  },

  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  sku: {
    type: String,
    default: "",
    trim: true,
    index: true
  },

  description: {
    type: String,
    default: "",
    trim: true
  },

  cost: {
    type: Number,
    default: 0,
    min: 0
  },

  listPrice: {
    type: Number,
    default: 0,
    min: 0
  },

  price: {
    type: Number,
    default: 0,
    min: 0
  },

  image: {
    type: String,
    default: ""
  },

  imageUrl: {
    type: String,
    default: ""
  },

  category: {
    type: String,
    default: "",
    trim: true,
    index: true
  },

  quantity: {
    type: Number,
    default: 0,
    min: 0
  },

  colors: {
    type: [String],
    default: []
  },

  sizes: {
    type: [String],
    default: []
  },

  storefrontVisible: {
    type: Boolean,
    default: true,
    index: true
  },

  storefront: {
    type: String,
    enum: ["signavi", "signavistudio", "both"],
    default: "both",
    index: true
  },

  active: {
    type: Boolean,
    default: true,
    index: true
  }

}, { timestamps: true })

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", productSchema)

export default Product
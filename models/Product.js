import mongoose from "mongoose"

/* ================= COLOR ================= */
const colorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: String,
  hex: String
}, { _id: false })

/* ================= VARIANT ================= */
const variantSchema = new mongoose.Schema({
  color: { type: String, required: true },

  size: {
    type: String,
    required: true,
    enum: ["XS","S","M","L","XL","2XL","3XL","4XL"]
  },

  stock: { type: Number, default: 0 },
  price: { type: Number, default: 0 },

  /* 🔥 MULTIPLE IMAGES */
  images: {
    type: [String],
    default: []
  }

}, { _id: false })

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({

  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },

  category: {
    type: String,
    default: "general",
    lowercase: true,
    trim: true
  },

  brand: { type: String, default: "Bella Canvas" },
  styleCode: { type: String, default: "" },

  variants: { type: [variantSchema], default: [] },

  price: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },

  sizes: {
    type: [String],
    enum: ["XS","S","M","L","XL","2XL","3XL","4XL"],
    default: []
  },

  colors: { type: [colorSchema], default: [] },

  /* fallback */
  image: { type: String, default: "" },

  active: { type: Boolean, default: true }

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
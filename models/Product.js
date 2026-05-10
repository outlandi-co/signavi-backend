import mongoose from "mongoose"

/* ================= NORMALIZE SIZE ================= */
const normalizeSize = (s) => {
  if (!s) return null

  const map = {
    XS: "XS",

    SMALL: "S",
    S: "S",

    MEDIUM: "M",
    M: "M",

    LARGE: "L",
    L: "L",

    XL: "XL",
    "EXTRA-LARGE": "XL",
    "X-LARGE": "XL",

    XXL: "2XL",
    "2XL": "2XL",

    "3XL": "3XL",
    "4XL": "4XL"
  }

  return map[String(s).toUpperCase()] || null
}

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
    enum: ["XS","S","M","L","XL","2XL","3XL","4XL"],
    set: normalizeSize
  },

  stock: { type: Number, default: 0 },
  price: { type: Number, default: 0 },

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
    set: (arr) => (arr || []).map(normalizeSize).filter(Boolean),
    default: []
  },

  colors: { type: [colorSchema], default: [] },

  image: { type: String, default: "" },

  active: { type: Boolean, default: true }

}, { timestamps: true })

/* 🔥 IMPORTANT: MAKE SURE THIS EXISTS */
const Product = mongoose.model("Product", productSchema)

export default Product
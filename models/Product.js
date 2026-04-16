import mongoose from "mongoose"

/* ================= COLOR SCHEMA ================= */
const colorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: String,
  hex: String,

  images: {
    front: String,
    back: String,
    lifestyle: String
  }
}, { _id: false })

/* ================= VARIANT SCHEMA ================= */
const variantSchema = new mongoose.Schema({
  color: {
    type: String,
    required: true
  },
  size: {
    type: String,
    required: true,
    enum: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]
  },
  stock: {
    type: Number,
    default: 0
  },
  price: {
    type: Number,
    default: 0
  }
}, { _id: false })

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({

  /* 🔥 CORE */
  name: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    default: ""
  },

  category: {
    type: String,
    default: "general",
    lowercase: true,
    trim: true
  },

  brand: {
    type: String,
    default: "Bella Canvas"
  },

  styleCode: {
    type: String,
    default: ""
  },

  /* 🔥 VARIANTS (MAIN SYSTEM) */
  variants: {
    type: [variantSchema],
    default: []
  },

  /* 💰 BASE PRICING (fallback) */
  price: {
    type: Number,
    default: 0
  },

  cost: {
    type: Number,
    default: 0
  },

  /* 📦 TOTAL STOCK (fallback) */
  stock: {
    type: Number,
    default: 0
  },

  /* 📏 SIZES (UI SUPPORT) */
  sizes: {
    type: [String],
    enum: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"], // ✅ FIXED
    default: []
  },

  /* 🎨 COLORS */
  colors: {
    type: [colorSchema],
    default: []
  },

  /* 🖼️ IMAGE */
  image: {
    type: String,
    default: ""
  },

  /* ⚙️ CONTROL */
  active: {
    type: Boolean,
    default: true
  }

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
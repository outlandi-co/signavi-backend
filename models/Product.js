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

/* ================= PRODUCT ================= */
const productSchema = new mongoose.Schema({

  /* 🔥 CORE */
  name: String,
  description: String,

  category: {
    type: String,
    default: "general"
  },

  brand: {
    type: String,
    default: "Bella Canvas"
  },

  styleCode: String,

  /* 💰 PRICING */
  price: Number,

  cost: {
    type: Number,
    default: 0
  },

  /* 📦 INVENTORY */
  stock: {
    type: Number,
    default: 0
  },

  /* 🔥 SIZES (STRICT VALIDATION UP TO 3XL) */
  sizes: {
    type: [String],
    enum: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    default: []
  },

  /* 🎨 COLORS */
  colors: {
    type: [colorSchema],
    default: []
  },

  /* 🖼️ IMAGE */
  image: String,

  /* ⚙️ CONTROL */
  active: {
    type: Boolean,
    default: true
  }

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
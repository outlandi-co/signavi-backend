import mongoose from "mongoose"

const colorSchema = new mongoose.Schema({
  name: String,          // Dust
  code: String,          // 00390
  hex: String,           // #D6C6B8 (optional)

  images: {
    front: String,
    back: String,
    lifestyle: String
  }
})

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

  styleCode: String, // 🔥 4739, 4719 etc

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

  sizes: [String], // ["XS","S","M","L","XL"]

  /* 🎨 COLORS */
  colors: [colorSchema],

  /* 🖼️ FALLBACK IMAGE */
  image: String, // default placeholder

  /* ⚙️ CONTROL */
  active: {
    type: Boolean,
    default: true
  }

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
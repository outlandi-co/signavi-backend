import mongoose from "mongoose"

const productSchema = new mongoose.Schema({

  name: String,

  vendor: String,

  sku: String,

  description: String,

  price: Number,

  /* 🔥 NEW: COST FOR PROFIT + TAXES */
  cost: {
    type: Number,
    default: 0
  },

  category: String,

  quantity: Number,

  image: String

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
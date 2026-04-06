import mongoose from "mongoose"

const productSchema = new mongoose.Schema({

  name: String,

  vendor: String,

  sku: String,

  description: String,

  price: Number,

  // 💰 cost tracking
  cost: {
    type: Number,
    default: 0
  },

  category: String,

  // 🔥 STOCK (REPLACED quantity)
  stock: {
    type: Number,
    default: 0
  },

  image: String

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
import mongoose from "mongoose"

const productSchema = new mongoose.Schema({

  name: String,
  description: String,

  category: {
    type: String,
    default: "general"
  },

  price: Number,

  cost: {
    type: Number,
    default: 0
  },

  stock: {
    type: Number,
    default: 0
  },

  image: String

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
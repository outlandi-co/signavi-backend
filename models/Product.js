import mongoose from "mongoose"

const productSchema = new mongoose.Schema({

  name: String,

  vendor: String,

  sku: String,

  description: String,

  price: Number,

  category: String,

  quantity: Number,

  image: String

}, { timestamps: true })

export default mongoose.model("Product", productSchema)
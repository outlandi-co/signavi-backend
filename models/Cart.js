import mongoose from "mongoose"

const CartSchema = new mongoose.Schema({

  email: {
    type: String,
    required: true
  },

  items: [
    {
      productId: String,
      name: String,
      price: Number,
      quantity: Number
    }
  ],

  recovered: {
    type: Boolean,
    default: false
  }

},{timestamps:true})

export default mongoose.model("Cart", CartSchema)
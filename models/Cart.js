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
      quantity: Number,
      image: String
    }
  ],

  recovered: {
    type: Boolean,
    default: false
  },

  abandonedEmailSent: {
    type: Boolean,
    default: false
  },

  discountCode: {
    type: String,
    default: ""
  },

  discountPercent: {
    type: Number,
    default: 0
  }

}, { timestamps: true })

export default mongoose.model("Cart", CartSchema)
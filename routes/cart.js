import mongoose from "mongoose"

const CartSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },

  items: [
    {
      productId: String,
      name: {
        type: String,
        required: true
      },
      price: {
        type: Number,
        required: true, // 🔥 FORCE PRICE
        min: 0
      },
      quantity: {
        type: Number,
        default: 1,
        min: 1
      },
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
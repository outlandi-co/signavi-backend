import mongoose from "mongoose"

const orderSchema = new mongoose.Schema({
  customerName: {
    type: String,
    default: "Store Order"
  },
  email: {
    type: String,
    default: ""
  },
  quantity: {
    type: Number,
    default: 1
  },
  price: {
    type: Number,
    required: true
  },
  printType: {
    type: String,
    default: "checkout"
  },
  artwork: {
    type: String,
    default: null
  },
  status: {
    type: String,
    default: "pending"
  },
  trackingNumber: {
    type: String,
    default: ""
  }
}, { timestamps: true })

export default mongoose.model("Order", orderSchema)
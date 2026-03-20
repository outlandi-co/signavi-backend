import mongoose from "mongoose"

const OrderSchema = new mongoose.Schema({

  orderId: String,

  /* 🔥 CUSTOMER INFO */
  customerName: String,
  email: String,
  printType: String,
  artwork: String,

  items: [
    {
      productId: String,
      name: String,
      price: Number,
      quantity: Number,
      size: String,
      color: String
    }
  ],

  total: Number,

  status: {
    type: String,
    enum: ["pending", "printing", "ready", "shipping", "shipped", "delivered"],
    default: "pending"
  },

  trackingNumber: {
    type: String,
    default: ""
  }

}, { timestamps: true })

export default mongoose.model("Order", OrderSchema)
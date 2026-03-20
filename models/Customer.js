import mongoose from "mongoose"

const CustomerSchema = new mongoose.Schema({

  name: String,
  email: {
    type: String,
    required: true
  },

  phone: String,

  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    }
  ],

  marketingConsent: {
    type: Boolean,
    default: true
  }

},{timestamps:true})

export default mongoose.model("Customer", CustomerSchema)
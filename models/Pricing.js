import mongoose from "mongoose"

const pricingSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    unique: true, // keep this
    lowercase: true,
    trim: true
  },
  profitMultiplier: {
    type: Number,
    default: 0.6
  },
  setupFee: {
    type: Number,
    default: 0
  }
}, { timestamps: true })

export default mongoose.model("Pricing", pricingSchema)
import mongoose from "mongoose"

const expenseSchema = new mongoose.Schema({

  name: { type: String, required: true },
  amount: { type: Number, required: true }, // dollars
  category: { type: String, default: "general" },

  /* optional tagging */
  relatedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    default: null
  },

  note: { type: String, default: "" }

}, { timestamps: true })

export default mongoose.model("Expense", expenseSchema)
import mongoose from "mongoose"

const CustomerSchema = new mongoose.Schema({

  /* BASIC INFO */
  name: {
    type: String,
    default: ""
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  phone: {
    type: String,
    default: ""
  },

  /* 🔗 RELATION TO ORDERS */
  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    }
  ],

  /* 📊 CRM METRICS */
  totalSpent: {
    type: Number,
    default: 0
  },

  totalOrders: {
    type: Number,
    default: 0
  },

  lastOrderDate: {
    type: Date
  },

  /* 🧠 CRM FEATURES */
  notes: {
    type: String,
    default: ""
  },

  isVIP: {
    type: Boolean,
    default: false
  },

  tags: [
    {
      type: String
    }
  ],

  marketingConsent: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
})
router.patch("/:id", async (req, res) => {
  try {
    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )

    res.json(updated)
  } catch (err) {
    console.error("UPDATE CUSTOMER ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default mongoose.model("Customer", CustomerSchema)
import mongoose from "mongoose"

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    default: ""
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ["admin", "customer"],
    default: "customer"
  },

  /* 🔥 ADD THESE (FOR RESET PASSWORD) */
  resetPasswordToken: {
    type: String
  },

  resetPasswordExpire: {
    type: Date
  }

}, { timestamps: true })

export default mongoose.model("User", userSchema)
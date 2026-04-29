import mongoose from "mongoose"
import bcrypt from "bcrypt"
import dotenv from "dotenv"
import User from "../models/User.js"

dotenv.config()

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("✅ Mongo connected")

    const existing = await User.findOne({
      email: "signavistudio@gmail.com"
    })

    if (existing) {
      console.log("⚠️ Admin already exists")
      process.exit()
    }

    const hashed = await bcrypt.hash("Suaves714209!", 10)

    await User.create({
      name: "Admin",
      email: "signavistudio@gmail.com",
      password: hashed,
      role: "admin"
    })

    console.log("✅ ADMIN CREATED")
    process.exit()

  } catch (err) {
    console.error("❌ ERROR:", err)
    process.exit(1)
  }
}

run()
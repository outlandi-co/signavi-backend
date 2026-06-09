import "dotenv/config"
import mongoose from "mongoose"

import Material from "../models/Material.js"
import materialCatalog from "./materialCatalog.js"

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)

    console.log("✅ Mongo connected")

    await Material.deleteMany({})
    console.log("🧹 Old materials cleared")

    await Material.insertMany(materialCatalog)
    console.log(`📦 Materials inserted: ${materialCatalog.length}`)

    console.log("🎉 Material catalog seeded successfully")

    process.exit(0)
  } catch (error) {
    console.error("❌ SEED ERROR:", error)
    process.exit(1)
  }
}

seedDatabase()
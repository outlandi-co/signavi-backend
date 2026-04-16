import mongoose from "mongoose"
import dotenv from "dotenv"
import Product from "./models/Product.js"

dotenv.config()

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("✅ Mongo connected for seed")

    await Product.deleteMany()
    console.log("🧹 Cleared products")

    await Product.insertMany([
      {
        name: "Full Zip Hoodie",
        description: "Heavyweight fleece hoodie",
        price: 45,
        stock: 20,
        category: "hoodie",
        image: "/placeholders/hoodie.png",
        sizes: ["S", "M", "L", "XL"],
        colors: [
          {
            name: "Dust",
            code: "00390",
            hex: "#D6C6B8",
            images: {
              front: "/placeholders/hoodie.png",
              back: "/placeholders/hoodie-back.png"
            }
          }
        ]
      },
      {
        name: "Pullover Hoodie",
        description: "Classic pullover",
        price: 40,
        stock: 15,
        category: "hoodie",
        image: "/placeholders/hoodie.png",
        sizes: ["S", "M", "L", "XL"]
      },
      {
        name: "Heavyweight Tee",
        description: "Premium cotton tee",
        price: 25,
        stock: 30,
        category: "tshirt",
        image: "/placeholders/tshirt.png",
        sizes: ["S", "M", "L", "XL"]
      }
    ])

    console.log("🔥 Seeded products successfully")

    process.exit()

  } catch (err) {
    console.error("💥 Seed error:", err)
    process.exit(1)
  }
}

seed()
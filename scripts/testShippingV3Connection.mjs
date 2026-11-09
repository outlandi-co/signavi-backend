import "dotenv/config"
import mongoose from "mongoose"

const originalUri = process.env.MONGO_URI

if (!originalUri) {
  throw new Error("MONGO_URI is missing")
}

const testDb = "signavi_shipping_v3_dev"

try {
  await mongoose.connect(originalUri, {
    dbName: testDb,
    serverSelectionTimeoutMS: 10000
  })

  const connectedDb = mongoose.connection.name

  if (connectedDb !== testDb) {
    throw new Error("Unexpected database selected")
  }

  console.log("V3 MongoDB test connection successful")
  console.log("Connected database:", connectedDb)
  console.log("No records created or modified")
} catch (error) {
  console.error("V3 MongoDB test failed:", error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
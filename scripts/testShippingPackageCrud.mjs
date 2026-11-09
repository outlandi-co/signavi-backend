import "dotenv/config"
import mongoose from "mongoose"
import ShippingPackage from "../models/ShippingPackage.js"

const dbName = "signavi_shipping_v3_dev"
let testPackage

try {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing")
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  if (mongoose.connection.name !== dbName) {
    throw new Error("Unexpected MongoDB database")
  }

  testPackage = await ShippingPackage.create({
    name: "V3 CRUD TEST - Temporary Mailer",
    carrier: "USPS",
    type: "mailer",
    lengthIn: 12,
    widthIn: 9,
    heightIn: 2,
    tareWeightOz: 1,
    maxWeightOz: 16,
    clearanceIn: 0,
    uspsFlatRate: false,
    verifiedShirtCapacity: 2,
    active: true
  })

  console.log("CREATE: PASS")

  const found = await ShippingPackage.findById(testPackage._id)

  if (!found) throw new Error("READ failed")
  console.log("READ: PASS")

  found.verifiedShirtCapacity = 3
  await found.save()

  const updated = await ShippingPackage.findById(testPackage._id)

  if (updated.verifiedShirtCapacity !== 3) {
    throw new Error("UPDATE failed")
  }

  console.log("UPDATE: PASS")

  updated.active = false
  await updated.save()

  const inactive = await ShippingPackage.findById(testPackage._id)

  if (inactive.active !== false) {
    throw new Error("DEACTIVATE failed")
  }

  console.log("DEACTIVATE: PASS")
} catch (error) {
  console.error("CRUD TEST FAILED:", error.message)
  process.exitCode = 1
} finally {
  if (testPackage?._id && mongoose.connection.readyState === 1) {
    try {
      await ShippingPackage.deleteOne({ _id: testPackage._id })
      console.log("CLEANUP: Temporary record removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
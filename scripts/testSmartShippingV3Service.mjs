import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import ShippingPackage from "../models/ShippingPackage.js"
import { calculateVerifiedApparelParcels } from "../utils/smartShippingV3Service.js"

const dbName = "signavi_shipping_v3_dev"
let testPackage

try {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing")
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(mongoose.connection.name, dbName)

  testPackage = await ShippingPackage.create({
    name: "V3 SERVICE TEST - Temporary Mailer",
    carrier: "Generic",
    type: "mailer",
    lengthIn: 14,
    widthIn: 12,
    heightIn: 4,
    tareWeightOz: 2,
    maxWeightOz: 80,
    verifiedShirtCapacity: 5,
    active: true
  })

  const result = await calculateVerifiedApparelParcels({
    quantity: 20,
    unitWeightOz: 8
  })

  assert.equal(result.success, true)
  assert.equal(result.totalUnits, 20)
  assert.equal(result.parcelCount, 4)

  assert.ok(
    result.parcels.every(
      (parcel) =>
        parcel.packageId === String(testPackage._id)
    )
  )

  console.log("MONGODB PACKAGE RETRIEVAL: PASS")
  console.log("20 SHIRTS: PASS (4 parcels)")
  console.log("ALL V3 SERVICE TESTS PASSED")

} catch (error) {
  console.error("SERVICE TEST FAILED:", error.message)
  process.exitCode = 1
} finally {
  if (testPackage?._id && mongoose.connection.readyState === 1) {
    try {
      await ShippingPackage.deleteOne({ _id: testPackage._id })
      console.log("CLEANUP: Temporary package removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
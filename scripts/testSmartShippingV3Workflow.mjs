import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import ShippingPackage from "../models/ShippingPackage.js"
import { calculateV3ApparelShipping } from "../utils/smartShippingV3Workflow.js"

const dbName = "signavi_shipping_v3_dev"
const testName = `V3 WORKFLOW TEST - ${Date.now()}`
let testPackage

const address = {
  name: "Test Recipient",
  street1: "123 Test Street",
  city: "Test City",
  state: "CA",
  zip: "90001",
  country: "US"
}

try {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing.")
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(mongoose.connection.name, dbName)

  // Temporarily exclude other verified packages from this test
  // without modifying any existing database records.
  const existing = await ShippingPackage.countDocuments({
    active: true,
    verifiedShirtCapacity: { $gte: 1 }
  })

  assert.equal(
    existing,
    0,
    "Other verified packages exist. Test stopped to avoid ambiguity."
  )

  testPackage = await ShippingPackage.create({
    name: testName,
    carrier: "Generic",
    type: "mailer",
    lengthIn: 14,
    widthIn: 12,
    heightIn: 4,
    tareWeightOz: 2,
    maxWeightOz: 80,
    verifiedShirtCapacity: 5,
    active: true,
    uspsFlatRate: false
  })

  let requests = 0

  const result = await calculateV3ApparelShipping({
    quantity: 20,
    unitWeightOz: 8,
    from: address,
    to: address,
    carrierAccountIds: ["test_account"],
    requestShipment: async (data) => {
      requests++

      assert.equal(data.parcels.length, 1)
      assert.deepEqual(
        data.carrier_accounts,
        ["test_account"]
      )

      return {
        rates: [{
          object_id: `test_rate_${requests}`,
          amount: "6.00",
          currency: "USD",
          provider: "USPS",
          carrier_account: "test_account",
          servicelevel: { token: "ground" }
        }]
      }
    }
  })

  assert.equal(result.success, true)
  assert.equal(result.totalUnits, 20)
  assert.equal(result.parcelCount, 4)
  assert.equal(requests, 4)
  assert.equal(result.rates.length, 1)
  assert.equal(result.rates[0].amount, "24.00")
  assert.equal(result.rates[0].parcelRateIds.length, 4)

  console.log("MONGODB PACKAGING: PASS")
  console.log("20 SHIRTS -> 4 PARCELS: PASS")
  console.log("4 SHIPPO MOCK REQUESTS: PASS")
  console.log("COMBINED SHIPPING RATE: PASS ($24.00)")

  requests = 0

  const bulk = await calculateV3ApparelShipping({
    quantity: 100,
    unitWeightOz: 8,
    from: address,
    to: address,
    requestShipment: async () => {
      requests++
      return { rates: [] }
    }
  })

  assert.equal(bulk.success, false)
  assert.equal(requests, 0)

  console.log("100-SHIRT PARCEL LIMIT: PASS (blocked safely)")
  console.log("ALL V3 WORKFLOW TESTS PASSED")

} catch (error) {
  console.error("V3 WORKFLOW TEST FAILED:", error.message)
  process.exitCode = 1
} finally {
  if (testPackage?._id && mongoose.connection.readyState === 1) {
    try {
      await ShippingPackage.deleteOne({
        _id: testPackage._id
      })
      console.log("CLEANUP: Temporary test package removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
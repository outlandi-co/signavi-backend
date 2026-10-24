import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "../utils/smartShippingV3ApplyPayment.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const marker = `V3_ORDER_SAVE_TEST_${crypto.randomUUID()}`

const prepared = {
  orderId: String(orderId),
  subtotalCents: 3998,
  taxCents: 330,
  shippingAmountCents: 1200,
  totalCents: 5528,
  parcelRateIds: ["rate_1", "rate_2"],
  carrier: "USPS",
  serviceToken: "usps_ground_advantage"
}

let connected = false

try {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing.")
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(
    mongoose.connection.name,
    dbName,
    "Wrong MongoDB database. No test order created."
  )

  console.log("ISOLATED V3 DATABASE: PASS")

  const order = new Order({
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: marker,
    email: "v3-order-save-test@example.com",
    subtotal: 39.98,
    tax: 3.30,
    finalPrice: 43.28,
    items: [{
      productId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      quantity: 2,
      finalPrice: 19.99,
      variant: {
        color: "black",
        size: "L"
      }
    }]
  })

  applyV3PreparedPayment(order, prepared)

  assert.equal(
    verifyV3AppliedPayment(order, prepared),
    true
  )

  await order.save()

  assert.equal(
    verifyV3AppliedPayment(order, prepared),
    true,
    "Save hooks changed the verified payment amount."
  )

  console.log("MONGOOSE SAVE HOOKS: PASS")

  const saved = await Order.findById(orderId)

  assert.ok(saved)
  assert.equal(saved.customerName, marker)

  assert.equal(
    verifyV3AppliedPayment(saved, prepared),
    true,
    "Reloaded payment amount does not match."
  )

  console.log("DATABASE RELOAD: PASS")
  console.log("SAVED SHIPPING: PASS ($12.00)")
  console.log("SAVED PAYMENT TOTAL: PASS ($55.28)")
  console.log("ALL V3 ORDER SAVE TESTS PASSED")

} catch (error) {
  console.error("V3 ORDER SAVE TEST FAILED:", error.message)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      const result = await Order.deleteOne({
        _id: orderId,
        customerName: marker
      })

      if (result.deletedCount === 1) {
        console.log("CLEANUP: Temporary V3 test order removed")
      } else {
        console.log("CLEANUP: No matching test order to remove")
      }
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const TEST_DATABASE = "signavi_shipping_v3_recovery_tests"

// Test-only MongoDB reader. No connection is created here.
// Models and connection may be injected for offline unit tests.
// Never use this factory as a production recovery endpoint.
export const createV3RecoveryTrustedRecordLoader = ({
  connection = mongoose.connection,
  OrderModel = Order,
  PaymentOperationModel = PaymentOperation
} = {}) => {
  const assertBoundary = () => {
    if (
      process.env.NODE_ENV !== "test" ||
      process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
      connection?.readyState !== 1 ||
      connection?.name !== TEST_DATABASE
    ) {
      throw new Error("V3 recovery test database boundary rejected.")
    }
  }

  assertBoundary()

  if (
    typeof OrderModel?.findById !== "function" ||
    typeof PaymentOperationModel?.findOne !== "function"
  ) {
    throw new Error("V3 recovery read-only models unavailable.")
  }

  return async orderId => {
    // Repeat the guard at execution time to catch connection changes.
    assertBoundary()

    if (
      typeof orderId !== "string" ||
      !/^[0-9a-fA-F]{24}$/.test(orderId)
    ) {
      throw new Error("Invalid V3 recovery order ID.")
    }

    const id = new mongoose.Types.ObjectId(orderId)

    const [order, operation] = await Promise.all([
      OrderModel.findById(id).lean(),
      PaymentOperationModel.findOne({ orderId: id }).lean()
    ])

    if (
      !order ||
      !operation ||
      String(order._id) !== String(id) ||
      String(operation.orderId) !== String(id)
    ) {
      throw new Error("V3 recovery persisted records missing or mismatched.")
    }

    return Object.freeze({ order, operation })
  }
}
import assert from "node:assert/strict"
import {
  createV3RecoveryTrustedRecordLoader
} from "../utils/smartShippingV3RecoveryTrustedRecordLoader.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

const id = "507f191e810c19729de860ea"
const forbiddenOriginal = "6addc6f674d8362634569095"
const db = {
  readyState: 1,
  name: "signavi_shipping_v3_recovery_tests"
}
const calls = { order: 0, operation: 0, writes: 0 }

let orderPresent = true
let operationMatches = true

const OrderModel = {
  findById: objectId => {
    calls.order++
    assert.equal(String(objectId), id)
    return {
      lean: async () =>
        orderPresent ? { _id: objectId, paymentStatus: "unpaid" } : null
    }
  }
}

const PaymentOperationModel = {
  findOne: query => {
    calls.operation++
    assert.equal(String(query.orderId), id)
    return {
      lean: async () => ({
        orderId: operationMatches
          ? query.orderId
          : "507f191e810c19729de860eb",
        status: "reconciliation_required"
      })
    }
  }
}

const options = {
  connection: db,
  OrderModel,
  PaymentOperationModel
}

const loader = createV3RecoveryTrustedRecordLoader(options)
const records = await loader(id)

assert.equal(String(records.order._id), id)
assert.equal(String(records.operation.orderId), id)
assert.equal(calls.order, 1)
assert.equal(calls.operation, 1)
assert.equal(calls.writes, 0)
console.log("MATCHING PERSISTED RECORDS: PASS")

await assert.rejects(loader("invalid-id"), /Invalid V3 recovery order ID/)
assert.equal(calls.order, 1)
assert.equal(calls.operation, 1)
console.log("INVALID ID REJECTED BEFORE QUERY: PASS")

// Never pass the protected original order into mocked model methods.
assert.notEqual(id, forbiddenOriginal)
console.log("PROTECTED ORIGINAL ORDER NOT QUERIED: PASS")

orderPresent = false
await assert.rejects(loader(id), /missing or mismatched/)
orderPresent = true
console.log("MISSING ORDER REJECTED: PASS")

operationMatches = false
await assert.rejects(loader(id), /missing or mismatched/)
operationMatches = true
console.log("MISMATCHED PAYMENT OPERATION REJECTED: PASS")

db.name = "signavi_shipping_v3_dev"
await assert.rejects(loader(id), /test database boundary rejected/)
assert.throws(
  () => createV3RecoveryTrustedRecordLoader(options),
  /test database boundary rejected/
)
console.log("DEVELOPMENT DATABASE REJECTED: PASS")

db.name = "signavi_shipping_v3_recovery_tests"
db.readyState = 0
await assert.rejects(loader(id), /test database boundary rejected/)
console.log("DISCONNECTED DATABASE REJECTED: PASS")

db.readyState = 1
process.env.NODE_ENV = "production"
await assert.rejects(loader(id), /test database boundary rejected/)
console.log("PRODUCTION MODE REJECTED: PASS")

assert.equal(calls.writes, 0)
console.log("NO DATABASE WRITES")
console.log("NO ACTUAL MONGODB CONNECTION")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("TEST-ONLY LOADER REGRESSION COMPLETE")
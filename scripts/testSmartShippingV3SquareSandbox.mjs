import assert from "node:assert/strict"
import { SquareEnvironment } from "square"
import {
  createV3SquareSandboxReader
} from "../utils/smartShippingV3SquareSandbox.js"

let constructed = 0
let linkReads = 0
let orderReads = 0
let createCalls = 0

class FakeSquareClient {
  constructor(options) {
    constructed++

    assert.equal(
      options.environment,
      SquareEnvironment.Sandbox
    )

    assert.equal(options.token, "sandbox-test-token")

    this.checkout = {
      paymentLinks: {
        get: async ({ id }) => {
          linkReads++
          return { paymentLink: { id } }
        },
        create: async () => {
          createCalls++
          throw new Error("Forbidden payment creation")
        }
      }
    }

    this.orders = {
      get: async ({ orderId }) => {
        orderReads++
        return { order: { id: orderId } }
      }
    }
  }
}

const valid = () => ({
  environment: "sandbox",
  token: "sandbox-test-token",
  locationId: "sandbox-location",
  Client: FakeSquareClient
})

const reader = createV3SquareSandboxReader(valid())

assert.equal(reader.environment, "sandbox")
assert.equal(reader.locationId, "sandbox-location")
assert.equal(Object.isFrozen(reader), true)
assert.equal(Object.isFrozen(reader.client), true)
assert.equal(reader.client.checkout.paymentLinks.create, undefined)
assert.equal(reader.client.checkout.paymentLinks.list, undefined)
assert.equal(reader.client.payments, undefined)

console.log("SANDBOX ENVIRONMENT ENFORCED: PASS")
console.log("READ-ONLY METHODS EXPOSED: PASS")
console.log("PAYMENT CREATION NOT EXPOSED: PASS")

const link = await reader.client.checkout.paymentLinks.get({
  id: "test-link"
})

const order = await reader.client.orders.get({
  orderId: "test-order"
})

assert.equal(link.paymentLink.id, "test-link")
assert.equal(order.order.id, "test-order")
assert.equal(linkReads, 1)
assert.equal(orderReads, 1)
assert.equal(createCalls, 0)

console.log("PAYMENT LINK READ DELEGATION: PASS")
console.log("SQUARE ORDER READ DELEGATION: PASS")

const reject = (label, changes, pattern) => {
  const options = valid()
  changes(options)

  const before = constructed

  assert.throws(
    () => createV3SquareSandboxReader(options),
    pattern
  )

  assert.equal(constructed, before)
  console.log(`${label}: PASS (rejected)`)
}

reject(
  "PRODUCTION ENVIRONMENT",
  x => { x.environment = "production" },
  /requires sandbox environment/
)

reject(
  "MISSING ENVIRONMENT",
  x => { x.environment = "" },
  /requires sandbox environment/
)

reject(
  "INVALID ENVIRONMENT",
  x => { x.environment = "development" },
  /requires sandbox environment/
)

reject(
  "MISSING TOKEN",
  x => { x.token = "" },
  /configuration incomplete/
)

reject(
  "MISSING LOCATION",
  x => { x.locationId = "" },
  /configuration incomplete/
)

const incompleteClient = valid()
incompleteClient.Client = class {
  constructor() {
    this.checkout = { paymentLinks: {} }
    this.orders = {}
  }
}

assert.throws(
  () => createV3SquareSandboxReader(incompleteClient),
  /read-only SDK methods unavailable/
)

console.log("INCOMPLETE SDK CLIENT: PASS (rejected)")

assert.equal(createCalls, 0)

console.log("NO PAYMENT CREATION: PASS")
console.log("ALL V3 SANDBOX READER TESTS PASSED")
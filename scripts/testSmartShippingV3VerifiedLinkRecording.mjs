import assert from "node:assert/strict"

import {
  verifyAndRecordV3SquareLink
} from "../utils/smartShippingV3VerifiedLinkRecording.js"

const reference = "signavi-v3-order-123"
let reads = 0
let writes = 0
let creates = 0

const makeClient = (changes = {}) => ({
  checkout: {
    paymentLinks: {
      get: async () => {
        reads++
        return {
          paymentLink: {
            id: "link-123",
            orderId: "square-order-456",
            url: "https://square.link/u/test",
            ...changes.link
          }
        }
      },
      create: async () => {
        creates++
        throw new Error("FORBIDDEN: payment creation")
      }
    }
  },
  orders: {
    get: async () => {
      reads++
      return {
        order: {
          id: "square-order-456",
          referenceId: reference,
          locationId: "sandbox-location",
          totalMoney: {
            amount: 5528n,
            currency: "USD"
          },
          ...changes.order
        }
      }
    }
  }
})

const run = changes =>
  verifyAndRecordV3SquareLink({
    client: makeClient(changes),
    expectedPaymentLinkId: "link-123",
    expectedAmountCents: 5528,
    expectedReferenceId: reference,
    expectedLocationId: "sandbox-location",
    recordVerifiedLink: async data => {
      writes++
      assert.equal(data.squarePaymentLinkId, "link-123")
      assert.equal(data.squareOrderId, "square-order-456")
      assert.equal(data.paymentUrl, "https://square.link/u/test")
      return { recorded: true }
    }
  })

const result = await run({})

assert.equal(result.verified, true)
assert.equal(result.paymentLinkRecorded, true)
assert.equal(result.customerPaymentConfirmed, false)
assert.equal(reads, 2)
assert.equal(writes, 1)
assert.equal(creates, 0)

console.log("VERIFIED LINK RECORDING: PASS")
console.log("PAYMENT NOT MARKED AS PAID: PASS")

const reject = async (name, changes) => {
  const before = writes
  await assert.rejects(run(changes))
  assert.equal(writes, before)
  assert.equal(creates, 0)
  console.log(`${name}: PASS`)
}

await reject("WRONG CHECKOUT REFERENCE BLOCKED", {
  order: { referenceId: "wrong-reference" }
})

await reject("WRONG LOCATION BLOCKED", {
  order: { locationId: "foreign-location" }
})

await reject("WRONG AMOUNT BLOCKED", {
  order: {
    totalMoney: { amount: 5529n, currency: "USD" }
  }
})

await reject("WRONG LINK ID BLOCKED", {
  link: { id: "foreign-link" }
})

await reject("UNTRUSTED PAYMENT URL BLOCKED", {
  link: { url: "https://example.org/pay" }
})

assert.equal(creates, 0)
assert.equal(writes, 1)

console.log("NO PAYMENT CREATION: PASS")
console.log("NO MONGODB WRITES: PASS")
console.log("ALL VERIFIED LINK RECORDING TESTS PASSED")
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

import {
  createStudioRecoveryHttpHandler
} from "../utils/createStudioRecoveryHttpHandler.mjs"

import {
  prepareStorefrontCreationAttempt
} from "../utils/prepareStorefrontCreationAttempt.mjs"

const originalRequest = {
  storefront: "signavi_studio",
  email: "recovery-http@example.invalid",
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 1
  }]
}

const attemptKey = randomUUID()
const recoverySecret = randomBytes(32).toString("base64url")
const createdAt = new Date(Date.now() - 1000)

const metadata = prepareStorefrontCreationAttempt({
  request: originalRequest,
  attemptKey,
  recoverySecret,
  now: createdAt.getTime()
})

const order = {
  _id: "507f1f77bcf86cd799439011",
  storefront: "signavi_studio",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  createdAt,
  ...metadata
}

let lookups = 0
let tokens = 0

const makeHandler = overrides =>
  createStudioRecoveryHttpHandler({
    checkThrottle: async () => ({ allowed: true }),
    findOrder: async () => {
      lookups++
      return order
    },
    issueGuestToken: async () => {
      tokens++
      return "test-guest-token"
    },
    ...overrides
  })

const run = async (handler, changes = {}) => {
  const headers = {
    "x-signavi-storefront-attempt-key": attemptKey,
    "x-signavi-storefront-recovery-secret": recoverySecret,
    ...(changes.headers ?? {})
  }

  const req = {
    body: { originalRequest },
    socket: { remoteAddress: "127.0.0.1" },
    get: name => headers[name.toLowerCase()],
    ...changes
  }

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    }
  }

  await handler(req, res)
  return res
}

const reset = () => {
  lookups = 0
  tokens = 0
}

reset()
const successful = await run(makeHandler())
assert.equal(successful.statusCode, 200)
assert.equal(successful.body.orderId, order._id)
assert.equal(successful.body.checkoutToken, "test-guest-token")
assert.equal(tokens, 1)
console.log("PASS: Authorized recovery returns minimal response")

reset()
const throttled = await run(makeHandler({
  checkThrottle: async () => ({ allowed: false })
}))
assert.equal(throttled.statusCode, 403)
assert.equal(lookups, 0)
assert.equal(tokens, 0)
console.log("PASS: Throttling blocks lookup and tokens")

reset()
const invalidSecret = await run(
  makeHandler(),
  {
    headers: {
      "x-signavi-storefront-recovery-secret": "invalid-secret"
    }
  }
)
assert.equal(invalidSecret.statusCode, 403)
assert.equal(tokens, 0)
console.log("PASS: Invalid recovery secret denied")

reset()
const alteredRequest = await run(
  makeHandler(),
  {
    body: {
      originalRequest: {
        ...originalRequest,
        email: "different@example.invalid"
      }
    }
  }
)
assert.equal(alteredRequest.statusCode, 403)
assert.equal(tokens, 0)
console.log("PASS: Altered order fingerprint denied")

reset()
const missingIdentity = await run(
  makeHandler(),
  { socket: {} }
)
assert.equal(missingIdentity.statusCode, 403)
assert.equal(lookups, 0)
assert.equal(tokens, 0)
console.log("PASS: Missing socket identity rejected")

reset()
const wrongStore = await run(makeHandler({
  findOrder: async () => ({
    ...order,
    storefront: "signavi_store"
  })
}))
assert.equal(wrongStore.statusCode, 403)
assert.equal(tokens, 0)
console.log("PASS: Signavi Store order rejected")

console.log("PASS: Studio recovery HTTP handler suite complete")

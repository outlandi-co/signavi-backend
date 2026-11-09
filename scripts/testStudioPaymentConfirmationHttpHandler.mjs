import test from "node:test"
import assert from "node:assert/strict"
import {
  createStudioPaymentConfirmationHttpHandler
} from "../utils/createStudioPaymentConfirmationHttpHandler.mjs"

const id = "507f1f77bcf86cd799439011"
const key = "123e4567-e89b-42d3-a456-426614174000"
const token = "isolated-valid-guest-token"

function order(overrides = {}) {
  return {
    _id: id,
    storefront: "signavi_studio",
    storefrontCreationAttemptKey: key,
    paymentStatus: "paid",
    storefrontRecoveryProofHash: "PRIVATE_RECOVERY_PROOF",
    storefrontCreationFingerprint: "PRIVATE_FINGERPRINT",
    squarePaymentId: "PRIVATE_SQUARE_PAYMENT",
    email: "private@example.invalid",
    ...overrides
  }
}

function request(overrides = {}) {
  const headers = {
    "x-signavi-guest-checkout-token": token,
    "x-signavi-storefront-attempt-key": key,
    ...overrides.headers
  }

  return {
    params: { id, ...overrides.params },
    get(name) {
      return headers[name.toLowerCase()]
    }
  }
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name] = value
      return this
    },
    status(value) {
      this.statusCode = value
      return this
    },
    json(value) {
      this.body = value
      return this
    }
  }
}

async function run({
  doc = order(),
  req = request(),
  validToken = true,
  findError = false,
  verifyError = false
} = {}) {
  let lookups = 0

  const handler = createStudioPaymentConfirmationHttpHandler({
    findOrder: async () => {
      lookups++
      if (findError) throw new Error("PRIVATE_DB_ERROR")
      return doc
    },
    verifyGuestToken: async (_order, provided) => {
      if (verifyError) throw new Error("PRIVATE_AUTH_ERROR")
      return validToken && provided === token
    }
  })

  const res = response()
  await handler(req, res)
  return { res, lookups }
}

test("paid Studio order returns exactly three safe fields", async () => {
  const { res } = await run()

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers["Cache-Control"], "no-store")
  assert.deepEqual(res.body, {
    success: true,
    data: {
      orderId: id,
      storefront: "signavi_studio",
      paymentStatus: "paid"
    }
  })

  const serialized = JSON.stringify(res.body)

  for (const secret of [
    "PRIVATE_RECOVERY_PROOF",
    "PRIVATE_FINGERPRINT",
    "PRIVATE_SQUARE_PAYMENT",
    "private@example.invalid"
  ]) {
    assert.equal(serialized.includes(secret), false)
  }
})

test("unpaid is not presented as paid", async () => {
  const { res } = await run({
    doc: order({ paymentStatus: "unpaid" })
  })
  assert.equal(res.body.data.paymentStatus, "unpaid")
})

test("refunded is not presented as paid", async () => {
  const { res } = await run({
    doc: order({ paymentStatus: "refunded" })
  })
  assert.equal(res.body.data.paymentStatus, "refunded")
})

test("missing guest token fails before lookup", async () => {
  const { res, lookups } = await run({
    req: request({
      headers: { "x-signavi-guest-checkout-token": "" }
    })
  })
  assert.equal(res.statusCode, 403)
  assert.equal(lookups, 0)
})

test("invalid guest token is denied", async () => {
  const { res } = await run({ validToken: false })
  assert.equal(res.statusCode, 403)
})

test("wrong attempt key is denied", async () => {
  const { res } = await run({
    req: request({
      headers: {
        "x-signavi-storefront-attempt-key":
          "123e4567-e89b-42d3-a456-426614174001"
      }
    })
  })
  assert.equal(res.statusCode, 403)
})

test("Signavi Store order is denied", async () => {
  const { res } = await run({
    doc: order({ storefront: "signavi_store" })
  })
  assert.equal(res.statusCode, 403)
})

test("missing order is denied", async () => {
  const { res } = await run({ doc: null })
  assert.equal(res.statusCode, 403)
})

test("malformed ID fails before database lookup", async () => {
  const { res, lookups } = await run({
    req: request({ params: { id: "not-an-order-id" } })
  })
  assert.equal(res.statusCode, 403)
  assert.equal(lookups, 0)
})

test("different returned order ID is denied", async () => {
  const { res } = await run({
    doc: order({ _id: "507f1f77bcf86cd799439012" })
  })
  assert.equal(res.statusCode, 403)
})

test("guest verification error fails closed", async () => {
  const { res } = await run({ verifyError: true })
  assert.equal(res.statusCode, 403)
  assert.equal(
    JSON.stringify(res.body).includes("PRIVATE_AUTH_ERROR"),
    false
  )
})

test("database error returns generic unavailable response", async () => {
  const { res } = await run({ findError: true })
  assert.equal(res.statusCode, 503)
  assert.equal(
    JSON.stringify(res.body).includes("PRIVATE_DB_ERROR"),
    false
  )
})

test("missing dependencies are rejected", () => {
  assert.throws(
    () => createStudioPaymentConfirmationHttpHandler(),
    /DEPENDENCIES_REQUIRED/
  )
})
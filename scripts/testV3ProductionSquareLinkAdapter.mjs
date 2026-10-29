import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import {
  createV3ProductionSquareLinkAdapter as execute
} from "../utils/createV3ProductionSquareLinkAdapter.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const key =
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${purchaseKey}`)
    .digest("hex")
    .slice(0, 40)}`

const request = {
  idempotencyKey: key,
  order: {
    locationId: "TEST_LOCATION",
    referenceId: `SV3-${orderId}`,
    lineItems: [{
      name: "Test checkout",
      quantity: "1",
      basePriceMoney: {
        amount: 2500n,
        currency: "USD"
      }
    }]
  },
  checkoutOptions: {
    redirectUrl: `https://signavi.store/success/${orderId}`,
    askForShippingAddress: false
  }
}

const input = {
  orderId,
  purchaseKey,
  persistedSquareIdempotencyKey: key,
  request
}

const fakeClient = callback => ({
  paymentLinks: {
    create: callback
  }
})

test("matching identity invokes fake Square exactly once", async () => {
  let calls = 0

  const result = await execute({
    ...input,
    checkoutClient: fakeClient(async (body, options) => {
      calls++
      assert.equal(body.idempotencyKey, key)
      assert.equal(options.maxRetries, 0)

      return {
        paymentLink: {
          id: "FAKE_LINK",
          orderId: "FAKE_ORDER",
          url: "https://square.link/u/fake"
        }
      }
    })
  })

  assert.equal(calls, 1)
  assert.equal(result.paymentLinkId, "FAKE_LINK")
  assert.equal(result.squareOrderId, "FAKE_ORDER")
  assert.equal(result.paymentUrl, "https://square.link/u/fake")
})

test("wrong persisted key blocks before transport", async () => {
  let calls = 0

  await assert.rejects(
    execute({
      ...input,
      persistedSquareIdempotencyKey: `sv3p-${"b".repeat(40)}`,
      checkoutClient: fakeClient(async () => {
        calls++
      })
    }),
    /SQUARE_REQUEST_IDENTITY_MISMATCH/
  )

  assert.equal(calls, 0)
})

test("wrong outgoing request key blocks transport", async () => {
  let calls = 0

  await assert.rejects(
    execute({
      ...input,
      request: { ...request, idempotencyKey: "WRONG" },
      checkoutClient: fakeClient(async () => {
        calls++
      })
    }),
    /SQUARE_REQUEST_IDENTITY_MISMATCH/
  )

  assert.equal(calls, 0)
})

test("incomplete Square evidence fails closed", async () => {
  let calls = 0

  await assert.rejects(
    execute({
      ...input,
      checkoutClient: fakeClient(async () => {
        calls++
        return { paymentLink: { id: "ONLY_ID" } }
      })
    }),
    /SQUARE_LINK_EVIDENCE_INCOMPLETE/
  )

  assert.equal(calls, 1)
})

test("Square timeout is not automatically retried", async () => {
  let calls = 0

  await assert.rejects(
    execute({
      ...input,
      checkoutClient: fakeClient(async () => {
        calls++
        throw new Error("SIMULATED_SQUARE_TIMEOUT")
      })
    }),
    /SIMULATED_SQUARE_TIMEOUT/
  )

  assert.equal(calls, 1)
})

test("missing transport fails before execution", async () => {
  await assert.rejects(
    execute({ ...input, checkoutClient: null }),
    /TRUSTED_SQUARE_TRANSPORT_REQUIRED/
  )
})
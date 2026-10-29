import test from "node:test"
import assert from "node:assert/strict"

import {
  buildV3ProductionPaymentLinkRequest
} from "../utils/buildV3ProductionPaymentLinkRequest.js"

import {
  createV3ProductionSquareLinkAdapter
} from "../utils/createV3ProductionSquareLinkAdapter.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const amountCents = 2500

const valid = {
  orderId,
  purchaseKey,
  amountCents,
  locationId: "TEST_LOCATION",
  redirectUrl: `https://signavi.store/success/${orderId}`
}

function build() {
  return buildV3ProductionPaymentLinkRequest(valid)
}

function fakeClient(callback) {
  return {
    paymentLinks: {
      create: callback
    }
  }
}

test("production builder and fake adapter share one Square identity", async () => {
  const request = build()
  let calls = 0

  const result = await createV3ProductionSquareLinkAdapter({
    orderId,
    purchaseKey,
    persistedSquareIdempotencyKey: request.idempotencyKey,
    request,
    checkoutClient: fakeClient(async (body, options) => {
      calls++

      assert.equal(body.idempotencyKey, request.idempotencyKey)
      assert.equal(options.maxRetries, 0)

      assert.equal(body.order.locationId, valid.locationId)
      assert.equal(
        body.checkoutOptions.redirectUrl,
        valid.redirectUrl
      )

      assert.equal(body.order.lineItems.length, 1)
      assert.equal(
        body.order.lineItems[0].basePriceMoney.amount,
        BigInt(amountCents)
      )
      assert.equal(
        body.order.lineItems[0].basePriceMoney.currency,
        "USD"
      )

      return {
        paymentLink: {
          id: "FAKE_LINK_325",
          orderId: "FAKE_ORDER_325",
          url: "https://square.link/u/fake325"
        }
      }
    })
  })

  assert.equal(calls, 1)
  assert.equal(result.paymentLinkId, "FAKE_LINK_325")
  assert.equal(result.squareOrderId, "FAKE_ORDER_325")
  assert.equal(result.paymentUrl, "https://square.link/u/fake325")
})

test("different persisted Square key prevents transport", async () => {
  let calls = 0

  await assert.rejects(
    createV3ProductionSquareLinkAdapter({
      orderId,
      purchaseKey,
      persistedSquareIdempotencyKey:
        `sv3p-${"b".repeat(40)}`,
      request: build(),
      checkoutClient: fakeClient(async () => {
        calls++
        throw new Error("SHOULD_NOT_RUN")
      })
    }),
    /SQUARE_REQUEST_IDENTITY_MISMATCH/
  )

  assert.equal(calls, 0)
})

test("invalid builder amount prevents transport", async () => {
  let calls = 0

  assert.throws(
    () => buildV3ProductionPaymentLinkRequest({
      ...valid,
      amountCents: 0
    })
  )

  assert.equal(calls, 0)
})

test("untrusted redirect rejected before transport", async () => {
  assert.throws(
    () => buildV3ProductionPaymentLinkRequest({
      ...valid,
      redirectUrl: "https://example.com/checkout"
    }),
    /UNTRUSTED_PRODUCTION_REDIRECT/
  )
})

test("request identity remains deterministic", () => {
  assert.equal(
    build().idempotencyKey,
    build().idempotencyKey
  )

  assert.match(
    build().idempotencyKey,
    /^sv3p-[a-f0-9]{40}$/
  )
})

test("request construction does not authorize execution", () => {
  const request = build()

  assert.equal(request.authorized, undefined)
  assert.equal(request.squareRequestAuthorized, undefined)
  assert.equal(request.retryAuthorized, undefined)
})
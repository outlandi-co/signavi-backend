
import test from "node:test"
import assert from "node:assert/strict"

import {
  runV3CheckoutHttpHandoff
} from "../utils/runV3CheckoutHttpHandoff.js"

const id = "aaaaaaaaaaaaaaaaaaaaaaaa"

const activation = {
  ready: true,
  persistedAndVerified: true,
  orderId: id,
  purchaseKey: `signavi-v3-production-purchase-${id}`,
  amountCents: 15000,
  squareRequestAuthorized: false
}

test("verified checkout returns Square redirect URL", async () => {
  let requests = 0

  const response = await runV3CheckoutHttpHandoff({
    activation,
    executeTrustedCheckout: async input => {
      requests++

      assert.equal(input.orderId, id)
      assert.equal(input.amountCents, 15000)

      return {
        status: "link_recorded",
        reason: "PAYMENT_LINK_DURABLY_RECORDED",
        paymentUrl: "https://square.link/u/test"
      }
    }
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.paymentCompleted, false)
  assert.equal(requests, 1)
})

test("unverified activation never reaches executor", async () => {
  let requests = 0

  const response = await runV3CheckoutHttpHandoff({
    activation: {
      ...activation,
      persistedAndVerified: false
    },
    executeTrustedCheckout: async () => {
      requests++
    }
  })

  assert.equal(response.status, 423)
  assert.equal(response.body.success, false)
  assert.equal(requests, 0)
})

test("uncertain Square result keeps checkout locked", async () => {
  const response = await runV3CheckoutHttpHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "reconciliation_required",
      reason: "SQUARE_OUTCOME_UNCERTAIN"
    })
  })

  assert.equal(response.status, 423)
  assert.equal(response.body.retryAuthorized, false)
})

test("invalid Square URL never reaches customer", async () => {
  const response = await runV3CheckoutHttpHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "link_recorded",
      reason: "PAYMENT_LINK_DURABLY_RECORDED",
      paymentUrl: "https://square.link.evil.example"
    })
  })

  assert.equal(response.status, 423)
  assert.equal(response.body.success, false)
})

test("missing checkout dependencies fail closed", async () => {
  const response = await runV3CheckoutHttpHandoff({
    activation
  })

  assert.equal(response.status, 503)
  assert.equal(response.body.success, false)
})


test("HTTP handoff forwards server redirect URL", async () => {
  const redirectUrl =
    "https://signavistudio.store/checkout/success"

  let receivedRedirectUrl

  const response = await runV3CheckoutHttpHandoff({
    activation,
    redirectUrl,
    executeTrustedCheckout: async input => {
      receivedRedirectUrl = input.redirectUrl

      return {
        status: "link_recorded",
        reason: "PAYMENT_LINK_DURABLY_RECORDED",
        paymentUrl: "https://square.link/u/test"
      }
    }
  })

  assert.equal(receivedRedirectUrl, redirectUrl)
  assert.equal(response.status, 200)
  assert.equal(response.body.paymentCompleted, false)
})

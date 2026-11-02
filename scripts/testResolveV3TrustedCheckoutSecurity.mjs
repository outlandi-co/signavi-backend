
import test from "node:test"
import assert from "node:assert/strict"

import {
  resolveV3TrustedCheckoutHandoff
} from "../utils/resolveV3TrustedCheckoutHandoff.js"

const id = "aaaaaaaaaaaaaaaaaaaaaaaa"

const activation = {
  ready: true,
  persistedAndVerified: true,
  orderId: id,
  purchaseKey: `signavi-v3-production-purchase-${id}`,
  amountCents: 15000,
  squareRequestAuthorized: false
}

test("mismatched purchase identity blocks execution", async () => {
  let calls = 0

  const result = await resolveV3TrustedCheckoutHandoff({
    activation: { ...activation, purchaseKey: "wrong-key" },
    executeTrustedCheckout: async () => { calls++ }
  })

  assert.equal(result.success, false)
  assert.equal(calls, 0)
})

test("invalid amount blocks execution", async () => {
  let calls = 0

  const result = await resolveV3TrustedCheckoutHandoff({
    activation: { ...activation, amountCents: -100 },
    executeTrustedCheckout: async () => { calls++ }
  })

  assert.equal(result.success, false)
  assert.equal(calls, 0)
})

test("embedded URL credentials are rejected", async () => {
  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "link_recorded",
      reason: "PAYMENT_LINK_DURABLY_RECORDED",
      paymentUrl: "https://user:pass@square.link/u/test"
    })
  })

  assert.equal(result.success, false)
  assert.equal(result.reason, "UNAPPROVED_PAYMENT_URL")
})

test("lookalike Square domain is rejected", async () => {
  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "link_recorded",
      reason: "PAYMENT_LINK_DURABLY_RECORDED",
      paymentUrl: "https://square.link.evil.example/payment"
    })
  })

  assert.equal(result.success, false)
  assert.equal(result.reason, "UNAPPROVED_PAYMENT_URL")
})

test("missing payment URL blocks redirect", async () => {
  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "link_recorded",
      reason: "PAYMENT_LINK_DURABLY_RECORDED"
    })
  })

  assert.equal(result.success, false)
  assert.equal(result.retryAuthorized, false)
})


test("server-controlled redirect URL reaches trusted executor", async () => {
  const redirectUrl =
    "https://signavistudio.store/checkout/success"

  let receivedRedirect

  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    redirectUrl,
    executeTrustedCheckout: async input => {
      receivedRedirect = input.redirectUrl

      return {
        status: "link_recorded",
        reason: "PAYMENT_LINK_DURABLY_RECORDED",
        paymentUrl: "https://square.link/u/test"
      }
    }
  })

  assert.equal(receivedRedirect, redirectUrl)
  assert.equal(result.success, true)
})

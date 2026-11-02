import test from "node:test"
import assert from "node:assert/strict"

import {
  resolveV3TrustedCheckoutHandoff
} from "../utils/resolveV3TrustedCheckoutHandoff.js"

const id = "aaaaaaaaaaaaaaaaaaaaaaaa"

const activation = Object.freeze({
  ready: true,
  persistedAndVerified: true,
  orderId: id,
  purchaseKey: `signavi-v3-production-purchase-${id}`,
  amountCents: 15000,
  squareRequestAuthorized: false
})

test("verified handoff returns approved Square URL", async () => {
  let calls = 0

  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async input => {
      calls++
      assert.equal(input.orderId, id)
      assert.equal(input.amountCents, 15000)

      return {
        status: "link_recorded",
        reason: "PAYMENT_LINK_DURABLY_RECORDED",
        paymentUrl: "https://square.link/u/test"
      }
    }
  })

  assert.equal(result.success, true)
  assert.equal(calls, 1)
})

test("unverified activation never invokes executor", async () => {
  let calls = 0

  const result = await resolveV3TrustedCheckoutHandoff({
    activation: { ...activation, ready: false },
    executeTrustedCheckout: async () => {
      calls++
    }
  })

  assert.equal(result.success, false)
  assert.equal(calls, 0)
})

test("failed payment recording never returns URL", async () => {
  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "reconciliation_required",
      paymentUrl: "https://square.link/u/test"
    })
  })

  assert.equal(result.success, false)
  assert.equal(result.retryAuthorized, false)
})

test("unapproved URLs are rejected", async () => {
  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async () => ({
      status: "link_recorded",
      reason: "PAYMENT_LINK_DURABLY_RECORDED",
      paymentUrl: "https://example.com/payment"
    })
  })

  assert.equal(result.success, false)
  assert.equal(result.reason, "UNAPPROVED_PAYMENT_URL")
})

test("executor errors fail closed", async () => {
  const result = await resolveV3TrustedCheckoutHandoff({
    activation,
    executeTrustedCheckout: async () => {
      throw new Error("Simulated timeout")
    }
  })

  assert.equal(result.success, false)
  assert.equal(result.retryAuthorized, false)
})
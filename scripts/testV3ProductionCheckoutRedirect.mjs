
import test from "node:test"
import assert from "node:assert/strict"

import {
  resolveV3ProductionCheckoutRedirect
} from "../utils/resolveV3ProductionCheckoutRedirect.js"

test("approved storefront generates fixed redirect", () => {
  assert.equal(
    resolveV3ProductionCheckoutRedirect({
      clientUrl: "https://signavistudio.store"
    }),
    "https://signavistudio.store/checkout/success"
  )
})

test("www storefront is accepted", () => {
  assert.equal(
    resolveV3ProductionCheckoutRedirect({
      clientUrl: "https://www.signavistudio.store"
    }),
    "https://www.signavistudio.store/checkout/success"
  )
})

for (const clientUrl of [
  "http://signavistudio.store",
  "https://signavistudio.store.evil.example",
  "https://user:password@signavistudio.store",
  "https://signavistudio.store:8443",
  "https://signavistudio.store/other",
  "https://signavistudio.store?next=evil",
  "https://signavistudio.store#fragment"
]) {
  test(`unapproved origin blocked: ${clientUrl}`, () => {
    assert.throws(() => {
      resolveV3ProductionCheckoutRedirect({
        clientUrl
      })
    }, /UNAPPROVED_STOREFRONT_ORIGIN/)
  })
}

test("missing storefront configuration is rejected", () => {
  assert.throws(() => {
    resolveV3ProductionCheckoutRedirect({
      clientUrl: ""
    })
  }, /STOREFRONT_URL_REQUIRED/)
})

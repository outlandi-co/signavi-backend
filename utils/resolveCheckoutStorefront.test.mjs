import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveCheckoutStorefront
} from "./resolveCheckoutStorefront.js"

test("existing Store checkout retains its default channel", () => {
  assert.equal(
    resolveCheckoutStorefront({ items: [{ productId: "p1" }] }),
    "signavi_store"
  )
})

test("explicit Studio checkout is supported", () => {
  assert.equal(
    resolveCheckoutStorefront({
      storefront: "signavi_studio",
      items: [{ productId: "p1", storefront: "signavi_studio" }]
    }),
    "signavi_studio"
  )
})

test("explicit Store checkout remains supported", () => {
  assert.equal(
    resolveCheckoutStorefront({
      storefront: "signavi_store",
      items: [{ productId: "p1", storefront: "signavi_store" }]
    }),
    "signavi_store"
  )
})

test("conflicting item storefront is rejected", () => {
  assert.throws(
    () => resolveCheckoutStorefront({
      storefront: "signavi_studio",
      items: [{ productId: "p1", storefront: "signavi_store" }]
    }),
    /different storefronts/
  )
})

test("mixed-channel cart is rejected", () => {
  assert.throws(
    () => resolveCheckoutStorefront({
      storefront: "signavi_studio",
      items: [
        { productId: "p1", storefront: "signavi_studio" },
        { productId: "p2", storefront: "signavi_store" }
      ]
    }),
    /different storefronts/
  )
})

test("unknown and blank channels are rejected", () => {
  for (const channel of ["", "other", "signavi-admin"]) {
    assert.throws(
      () => resolveCheckoutStorefront({ storefront: channel }),
      /Invalid storefront channel/
    )
  }
})

test("invalid request and item types are rejected", () => {
  assert.throws(
    () => resolveCheckoutStorefront(null),
    /Invalid checkout request/
  )

  assert.throws(
    () => resolveCheckoutStorefront({
      storefront: "signavi_studio",
      items: [null]
    }),
    /Invalid checkout item/
  )
})
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import {
  resolveCheckoutStorefront
} from "../utils/resolveCheckoutStorefront.js"

import {
  fingerprintPreCatalogStorefrontOrder
} from "../utils/storefrontPreCatalogFingerprint.mjs"

const route = fs.readFileSync(
  new URL("../routes/orders.js", import.meta.url),
  "utf8"
)

const model = fs.readFileSync(
  new URL("../models/Order.js", import.meta.url),
  "utf8"
)

const request = {
  email: "customer@example.com",
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 1
  }]
}

test("existing Store request keeps Store channel", () => {
  assert.equal(
    resolveCheckoutStorefront(request),
    "signavi_store"
  )
})

test("Studio requests resolve to Studio channel", () => {
  assert.equal(
    resolveCheckoutStorefront({
      ...request,
      storefront: "signavi_studio"
    }),
    "signavi_studio"
  )
})

test("invalid or mixed storefronts are rejected", () => {
  assert.throws(() => resolveCheckoutStorefront({
    ...request,
    storefront: "invalid"
  }))

  assert.throws(() => resolveCheckoutStorefront({
    ...request,
    storefront: "signavi_studio",
    items: [{
      ...request.items[0],
      storefront: "signavi_store"
    }]
  }))
})

test("Studio fingerprint differs from legacy Store", () => {
  assert.notEqual(
    fingerprintPreCatalogStorefrontOrder(request),
    fingerprintPreCatalogStorefrontOrder({
      ...request,
      storefront: "signavi_studio"
    })
  )
})

test("order route validates channel before attempt lookup", () => {
  const validation =
    route.indexOf("checkoutStorefront = resolveCheckoutStorefront(b)")
  const attempt =
    route.indexOf("await resolvePreCatalogStorefrontAttempt({")

  assert.ok(validation >= 0)
  assert.ok(attempt > validation)
})

test("catalog query uses validated storefront", () => {
  assert.match(
    route,
    /Product\.find\(\{[\s\S]*?storefront: checkoutStorefront\s*\}\)/
  )
})

test("order persists validated channel and retains guest source", () => {
  assert.match(
    route,
    /Order\.create\(\{[\s\S]*?storefront: checkoutStorefront/
  )
  assert.match(route, /source: "store"/)
  assert.match(route, /createGuestCheckoutToken\(order\)/)
  assert.match(route, /verifyGuestCheckoutToken\(order, guestToken\)/)
})

test("Order model supports both storefront channels", () => {
  assert.match(
    model,
    /storefront:\s*\{\s*type: String,\s*enum: \["signavi_store", "signavi_studio"\]/
  )
})

import assert from "node:assert/strict"
import fs from "node:fs"
import {
  getSmartShippingCheckoutVersion
} from "../utils/smartShippingV3FeatureFlags.js"

const source = fs.readFileSync(
  new URL("../routes/orders.js", import.meta.url),
  "utf8"
)

const routeStart = source.indexOf('"/:id/checkout"')
const routeEnd = source.indexOf("/* ================= SHIP ORDER", routeStart)

assert.ok(routeStart >= 0)
assert.ok(routeEnd > routeStart)

const checkout = source.slice(routeStart, routeEnd)

const guard = checkout.indexOf(
  'getSmartShippingCheckoutVersion() === "v3"'
)
const preview = checkout.indexOf('code: "V3_PREVIEW_ONLY"')
const shipping = checkout.indexOf(
  "applyCheckoutShipping(order, req.body || {})"
)
const save = checkout.indexOf("await order.save()")
const square = checkout.indexOf(
  "/api/square/create-payment/"
)

assert.ok(guard >= 0)
assert.ok(preview > guard)
assert.ok(shipping > preview)
assert.ok(save > preview)
assert.ok(square > preview)

console.log("V3 GUARD BEFORE V2 SHIPPING: PASS")
console.log("V3 PREVIEW BEFORE DATABASE SAVE: PASS")
console.log("V3 PREVIEW BEFORE SQUARE HANDOFF: PASS")

assert.match(
  checkout,
  /prepareV3CheckoutPayment\(\{/
)
assert.match(
  checkout,
  /verifyV3AppliedPayment\(order, prepared\)/
)
assert.match(
  checkout,
  /return res\.status\(501\)\.json\(\{/
)

console.log("V3 VERIFICATION AND EARLY RETURN: PASS")

const previousFlag = process.env.SMART_SHIPPING_V3_ENABLED
const previousNodeEnv = process.env.NODE_ENV

try {
  delete process.env.SMART_SHIPPING_V3_ENABLED
  process.env.NODE_ENV = "development"

  assert.equal(getSmartShippingCheckoutVersion(), "v2")
  console.log("DEFAULT V2 ROUTING: PASS")

  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.NODE_ENV = "production"

  assert.equal(getSmartShippingCheckoutVersion(), "v2")
  console.log("PRODUCTION V2 ROUTING: PASS")
} finally {
  if (previousFlag === undefined) {
    delete process.env.SMART_SHIPPING_V3_ENABLED
  } else {
    process.env.SMART_SHIPPING_V3_ENABLED = previousFlag
  }

  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = previousNodeEnv
  }
}

console.log("ALL V3 CHECKOUT GUARD STRUCTURE TESTS PASSED")
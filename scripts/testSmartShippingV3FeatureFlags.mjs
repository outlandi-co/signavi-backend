import assert from "node:assert/strict"
import {
  isSmartShippingV3Enabled,
  getSmartShippingCheckoutVersion
} from "../utils/smartShippingV3FeatureFlags.js"

const originalFlag = process.env.SMART_SHIPPING_V3_ENABLED
const originalNodeEnv = process.env.NODE_ENV

try {
  delete process.env.SMART_SHIPPING_V3_ENABLED
  process.env.NODE_ENV = "development"

  assert.equal(isSmartShippingV3Enabled(), false)
  assert.equal(getSmartShippingCheckoutVersion(), "v2")
  console.log("DEFAULT CHECKOUT: PASS (V2)")

  process.env.SMART_SHIPPING_V3_ENABLED = "false"

  assert.equal(getSmartShippingCheckoutVersion(), "v2")
  console.log("DISABLED FLAG: PASS (V2)")

  process.env.SMART_SHIPPING_V3_ENABLED = "true"

  assert.equal(isSmartShippingV3Enabled(), true)
  assert.equal(getSmartShippingCheckoutVersion(), "v3")
  console.log("DEVELOPMENT FLAG: PASS (V3)")

  process.env.NODE_ENV = "production"

  assert.equal(isSmartShippingV3Enabled(), false)
  assert.equal(getSmartShippingCheckoutVersion(), "v2")
  console.log("PRODUCTION SAFETY: PASS (V2)")

  console.log("ALL V3 FEATURE SWITCH TESTS PASSED")
} finally {
  if (originalFlag === undefined) {
    delete process.env.SMART_SHIPPING_V3_ENABLED
  } else {
    process.env.SMART_SHIPPING_V3_ENABLED = originalFlag
  }

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
}
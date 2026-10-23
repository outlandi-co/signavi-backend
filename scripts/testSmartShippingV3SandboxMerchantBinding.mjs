import assert from "node:assert/strict"

import {
  verifyV3SandboxMerchantBinding
} from "../utils/smartShippingV3SandboxMerchantBinding.js"

const good = {
  environment: "sandbox",
  expectedMerchantId: "sandbox-merchant-1",
  expectedLocationId: "sandbox-location-1",
  merchantResponse: {
    merchant: {
      id: "sandbox-merchant-1",
      status: "ACTIVE",
      currency: "USD"
    }
  },
  locationResponse: {
    location: {
      id: "sandbox-location-1",
      merchantId: "sandbox-merchant-1",
      status: "ACTIVE",
      currency: "USD"
    }
  }
}

const inspect = changes =>
  verifyV3SandboxMerchantBinding({
    ...good,
    ...changes
  })

const reject = (label, changes, reason) => {
  const result = inspect(changes)
  assert.equal(result.verified, false, label)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.reason, reason)
  console.log(`${label}: PASS`)
}

const verified = inspect({})

assert.equal(verified.verified, true)
assert.equal(verified.merchantId, good.expectedMerchantId)
assert.equal(verified.locationId, good.expectedLocationId)
assert.equal(verified.squareRequestAuthorized, false)

console.log("TRUSTED SANDBOX IDENTITIES: PASS")

reject(
  "PRODUCTION ENVIRONMENT BLOCKED",
  { environment: "production" },
  "invalid_trusted_configuration"
)

reject(
  "MISSING EXPECTED MERCHANT BLOCKED",
  { expectedMerchantId: "" },
  "invalid_trusted_configuration"
)

reject(
  "WRONG MERCHANT BLOCKED",
  {
    merchantResponse: {
      merchant: {
        ...good.merchantResponse.merchant,
        id: "other-merchant"
      }
    }
  },
  "merchant_identity_mismatch"
)

reject(
  "WRONG LOCATION BLOCKED",
  {
    locationResponse: {
      location: {
        ...good.locationResponse.location,
        id: "other-location"
      }
    }
  },
  "location_identity_mismatch"
)

reject(
  "FOREIGN MERCHANT LOCATION BLOCKED",
  {
    locationResponse: {
      location: {
        ...good.locationResponse.location,
        merchantId: "foreign-merchant"
      }
    }
  },
  "location_merchant_mismatch"
)

reject(
  "INACTIVE LOCATION BLOCKED",
  {
    locationResponse: {
      location: {
        ...good.locationResponse.location,
        status: "INACTIVE"
      }
    }
  },
  "inactive_square_merchant_or_location"
)

reject(
  "NON-USD LOCATION BLOCKED",
  {
    locationResponse: {
      location: {
        ...good.locationResponse.location,
        currency: "CAD"
      }
    }
  },
  "square_currency_mismatch"
)

reject(
  "MISSING LOCATION DATA BLOCKED",
  { locationResponse: {} },
  "missing_square_identity"
)

// Confirm Square snake_case compatibility.
const snakeCase = inspect({
  locationResponse: {
    location: {
      id: "sandbox-location-1",
      merchant_id: "sandbox-merchant-1",
      status: "ACTIVE",
      currency: "USD"
    }
  }
})

assert.equal(snakeCase.verified, true)
console.log("SQUARE SNAKE_CASE RESPONSE: PASS")

console.log("NO SQUARE AUTHORIZATION: PASS")
console.log("NO NETWORK OR DATABASE REQUESTS: PASS")
console.log("ALL SANDBOX MERCHANT BINDING TESTS PASSED")
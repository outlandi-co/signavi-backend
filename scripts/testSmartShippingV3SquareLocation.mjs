import assert from "node:assert/strict"
import {
  verifyV3SquareOrderLocation
} from "../utils/smartShippingV3SquareLocation.js"

const expectedLocationId = "SANDBOX-LOCATION-A"

const valid = verifyV3SquareOrderLocation({
  squareOrder: {
    id: "square-order-1",
    locationId: expectedLocationId
  },
  expectedLocationId
})

assert.equal(valid.locationVerified, true)
assert.equal(valid.locationId, expectedLocationId)

console.log("MATCHING SQUARE LOCATION: PASS")

const snakeCase = verifyV3SquareOrderLocation({
  squareOrder: {
    id: "square-order-1",
    location_id: expectedLocationId
  },
  expectedLocationId
})

assert.equal(snakeCase.locationVerified, true)

console.log("SNAKE-CASE LOCATION FIELD: PASS")

assert.throws(
  () => verifyV3SquareOrderLocation({
    squareOrder: {
      locationId: "SANDBOX-LOCATION-B"
    },
    expectedLocationId
  }),
  /location mismatch/
)

console.log("DIFFERENT SQUARE LOCATION REJECTED: PASS")

assert.throws(
  () => verifyV3SquareOrderLocation({
    squareOrder: {
      id: "square-order-1"
    },
    expectedLocationId
  }),
  /location missing/
)

console.log("MISSING SQUARE LOCATION REJECTED: PASS")

assert.throws(
  () => verifyV3SquareOrderLocation({
    squareOrder: null,
    expectedLocationId
  }),
  /location missing/
)

console.log("MISSING SQUARE ORDER REJECTED: PASS")

assert.throws(
  () => verifyV3SquareOrderLocation({
    squareOrder: {
      locationId: expectedLocationId
    },
    expectedLocationId: ""
  }),
  /trusted V3 Square location/
)

console.log("MISSING TRUSTED LOCATION REJECTED: PASS")

assert.throws(
  () => verifyV3SquareOrderLocation({
    squareOrder: {
      locationId: "SANDBOX-LOCATION-B",
      location_id: expectedLocationId
    },
    expectedLocationId
  }),
  /location mismatch/
)

console.log("CONFLICTING LOCATION FIELDS REJECTED: PASS")

assert.throws(
  () => verifyV3SquareOrderLocation({
    squareOrder: {
      locationId: expectedLocationId,
      location_id: "SANDBOX-LOCATION-B"
    },
    expectedLocationId
  }),
  /location mismatch/
)

console.log("REVERSED LOCATION CONFLICT REJECTED: PASS")

const bothMatching = verifyV3SquareOrderLocation({
  squareOrder: {
    locationId: expectedLocationId,
    location_id: expectedLocationId
  },
  expectedLocationId
})

assert.equal(bothMatching.locationVerified, true)

console.log("TWO MATCHING LOCATION FIELDS: PASS")
console.log("ALL V3 SQUARE LOCATION TESTS PASSED")
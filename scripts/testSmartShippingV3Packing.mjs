import assert from "node:assert/strict"
import { packVerifiedApparel } from "../utils/smartShippingV3Packing.js"

// Simulated packing-test fixture; NOT a real USPS package.
const testPackage = {
  _id: "v3-test-package",
  name: "TEST ONLY - Five Shirt Mailer",
  carrier: "Generic",
  type: "mailer",
  lengthIn: 14,
  widthIn: 12,
  heightIn: 4,
  tareWeightOz: 2,
  maxWeightOz: 80,
  verifiedShirtCapacity: 5,
  active: true,
  uspsFlatRate: false
}

for (const [quantity, expectedParcels] of [
  [1, 1],
  [5, 1],
  [20, 4],
  [100, 20]
]) {
  const result = packVerifiedApparel({
    quantity,
    unitWeightOz: 8,
    packages: [testPackage]
  })

  assert.equal(result.success, true)
  assert.equal(result.parcelCount, expectedParcels)
  assert.equal(
    result.parcels.reduce((sum, parcel) => sum + parcel.quantity, 0),
    quantity
  )

  assert.ok(
    result.parcels.every((parcel) => Number(parcel.weight) <= 80)
  )

  console.log(`${quantity} SHIRTS: PASS (${expectedParcels} parcel(s))`)
}

const unverified = packVerifiedApparel({
  quantity: 5,
  unitWeightOz: 8,
  packages: [{
    ...testPackage,
    verifiedShirtCapacity: null
  }]
})

assert.ok(unverified.error)
console.log("UNVERIFIED CAPACITY: PASS (rejected)")

const inactive = packVerifiedApparel({
  quantity: 5,
  unitWeightOz: 8,
  packages: [{
    ...testPackage,
    active: false
  }]
})

assert.ok(inactive.error)
console.log("INACTIVE PACKAGE: PASS (rejected)")

const weightLimited = packVerifiedApparel({
  quantity: 5,
  unitWeightOz: 8,
  packages: [{
    ...testPackage,
    maxWeightOz: 18
  }]
})

assert.equal(weightLimited.parcelCount, 3)
assert.deepEqual(
  weightLimited.parcels.map((parcel) => parcel.quantity),
  [2, 2, 1]
)
console.log("WEIGHT LIMIT: PASS (3 parcels)")

const separate = packVerifiedApparel({
  quantity: 5,
  unitWeightOz: 8,
  shipSeparately: true,
  packages: [testPackage]
})

assert.equal(separate.parcelCount, 5)
console.log("SHIP SEPARATELY: PASS (5 parcels)")

console.log("ALL V3 PACKING TESTS PASSED")
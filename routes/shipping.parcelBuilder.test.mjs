import test, { afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import Product from "../models/Product.js"
import Profile from "../models/ShippingProductPackageProfile.js"
import { makeCartParcels } from "./shipping.js"
import {
  buildVerifiedShippoShipmentParcels
} from "../utils/buildVerifiedShippoShipmentParcels.mjs"

const productId = "507f1f77bcf86cd799439011"
const packageId = "507f1f77bcf86cd799439012"

const box = {
  id: packageId,
  name: "Verified test package",
  type: "box",
  length: 12,
  width: 10,
  height: 4,
  tare: 2,
  maxWeight: 50,
  clearance: 0.5,
  uspsFlatRate: false,
  shippoParcelTemplate: ""
}

const product = (shipping, overrides = {}) => ({
  _id: productId,
  productType: "physical",
  storefront: "signavi_studio",
  active: true,
  storefrontVisible: true,
  shipping,
  ...overrides
})

const savedShipping = {
  mode: "saved_package",
  packageId,
  packagingType: "box"
}

const customShipping = {
  mode: "product_measurements",
  packagingType: "box",
  weightOz: 7,
  lengthIn: 10,
  widthIn: 8,
  heightIn: 1,
  shipSeparately: false
}

const profile = {
  productId,
  packageId,
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Test verifier",
  verifiedAt: new Date("2026-11-01T12:00:00Z"),
  verificationNotes: "Test fixture with verified measurements.",
  active: true
}

afterEach(() => mock.restoreAll())

function mockCollection(model, method, records, inspect) {
  mock.method(model, method, (filter) => {
    inspect?.(filter)

    return {
      select() {
        return this
      },
      async lean() {
        return records
      }
    }
  })
}

function setup({ products, profiles = [], onProductQuery, onProfileQuery }) {
  mockCollection(
    Product, "find", products, onProductQuery
  )

  mockCollection(
    Profile, "find", profiles, onProfileQuery
  )
}

const cart = (quantity = 1) => [
  { productId, quantity }
]

test("saved package uses verified profile and not product dimensions", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: [profile],
    onProductQuery: filter => {
      assert.equal(filter.storefront, "signavi_studio")
    },
    onProfileQuery: filter => {
      assert.equal(String(filter.packageId), packageId)
      assert.equal(filter.active, true)
    }
  })

  const result = await makeCartParcels(
    cart(1),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 1)
  assert.equal(result.parcels[0].weight, "9")
})

test("five saved-package shirts produce two verified parcels", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(5),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.deepEqual(
    result.parcels.map(parcel => parcel.weight),
    ["23", "16"]
  )
})

test("missing profile blocks saved-package checkout", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: []
  })

  const result = await makeCartParcels(
    cart(),
    [box],
    "signavi_studio"
  )

  assert.ok(result.error)
  assert.equal(result.parcels, undefined)
})

test("inactive profile blocks saved-package checkout", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: [{ ...profile, active: false }]
  })

  const result = await makeCartParcels(
    cart(),
    [box],
    "signavi_studio"
  )

  assert.ok(result.error)
})

test("Flat Rate packages remain blocked before profile lookup", async () => {
  let profileQueried = false

  setup({
    products: [product(savedShipping)],
    profiles: [profile],
    onProfileQuery: () => {
      profileQueried = true
    }
  })

  const result = await makeCartParcels(
    cart(),
    [{
      ...box,
      uspsFlatRate: true,
      shippoParcelTemplate: "USPS_SmallFlatRateBox"
    }],
    "signavi_studio"
  )

  assert.match(result.error, /Flat Rate/)
  assert.equal(profileQueried, false)
})

test("ordinary custom measurements retain existing calculation", async () => {
  setup({
    products: [product(customShipping)],
    profiles: []
  })

  const result = await makeCartParcels(
    cart(),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 1)
  assert.equal(result.parcels[0].weight, "9")
})

test("custom measurements cannot automatically select Flat Rate packaging", async () => {
  setup({
    products: [product(customShipping)]
  })

  const result = await makeCartParcels(
    cart(),
    [{ ...box, uspsFlatRate: true }],
    "signavi_studio"
  )

  assert.ok(result.error)
})

test("Store products cannot be quoted as Studio products", async () => {
  setup({
    products: [],
    onProductQuery: filter => {
      assert.equal(filter.storefront, "signavi_studio")
    }
  })

  const result = await makeCartParcels(
    cart(),
    [box],
    "signavi_studio"
  )

  assert.match(result.error, /unavailable/i)
})

test("invalid storefront fails before database access", async () => {
  let queried = false

  setup({
    products: [],
    onProductQuery: () => {
      queried = true
    }
  })

  const result = await makeCartParcels(
    cart(),
    [box],
    "unrecognized_store"
  )

  assert.match(result.error, /Invalid shipping storefront/)
  assert.equal(queried, false)
})

test("unavailable products cannot receive parcel plans", async () => {
  setup({
    products: [
      product(savedShipping, { storefrontVisible: false })
    ],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(),
    [box],
    "signavi_studio"
  )

  assert.match(result.error, /unavailable/i)
})
test("saved package honors shipSeparately for five shirts", async () => {
  setup({
    products: [product({
      ...savedShipping,
      shipSeparately: true
    })],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(5),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 5)
  assert.deepEqual(
    result.parcels.map(parcel => parcel.weight),
    ["9", "9", "9", "9", "9"]
  )
})

test("saved package combines shirts when separate shipping is disabled", async () => {
  setup({
    products: [product({
      ...savedShipping,
      shipSeparately: false
    })],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(5),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.deepEqual(
    result.parcels.map(parcel => parcel.weight),
    ["23", "16"]
  )
})

test("separate shipping rejects an order requiring eleven parcels", async () => {
  setup({
    products: [product({
      ...savedShipping,
      shipSeparately: true
    })],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(11),
    [box],
    "signavi_studio"
  )

  assert.match(result.error, /more than 10 shipping parcels/i)
  assert.equal(result.parcels, undefined)
})
test("saved-package plan retains trusted package identity", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(1),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 1)
  assert.equal(result.parcelEntries.length, 1)
  assert.equal(result.parcelEntries[0].parcel, result.parcels[0])
  assert.equal(result.parcelEntries[0].packaging.id, packageId)
  assert.equal(result.parcelEntries[0].packaging.uspsFlatRate, false)
})

test("custom-measurement plan retains selected package identity", async () => {
  setup({
    products: [product(customShipping)]
  })

  const result = await makeCartParcels(
    cart(1),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcelEntries.length, 1)
  assert.equal(result.parcelEntries[0].packaging.id, packageId)
  assert.equal(result.parcelEntries[0].parcel.weight, "9")
})

test("separate shipping preserves identity for every parcel", async () => {
  setup({
    products: [product({
      ...savedShipping,
      shipSeparately: true
    })],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(5),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 5)
  assert.equal(result.parcelEntries.length, 5)

  for (let i = 0; i < result.parcels.length; i++) {
    assert.equal(result.parcelEntries[i].parcel, result.parcels[i])
    assert.equal(result.parcelEntries[i].packaging.id, packageId)
  }
})

test("internal package identity never contaminates carrier parcels", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(1),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.deepEqual(Object.keys(result.parcels[0]).sort(), [
    "distance_unit",
    "height",
    "length",
    "mass_unit",
    "weight",
    "width"
  ])
  assert.equal(result.parcels[0].packageId, undefined)
  assert.equal(result.parcels[0].shippoParcelTemplate, undefined)
})

test("missing trusted package ID rejects parcel plan", async () => {
  setup({
    products: [product(customShipping)]
  })

  const result = await makeCartParcels(
    cart(1),
    [{ ...box, id: undefined }],
    "signavi_studio"
  )

  assert.ok(result.error)
  assert.equal(result.parcels, undefined)
})
// STUDIO_058H41_CHECKOUT_ADAPTER_INTEGRATION
test("checkout parcel entries produce clean Shippo payloads", async () => {
  setup({
    products: [product(savedShipping)],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(5),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)
  assert.equal(result.parcelEntries.length, 2)

  const payload = buildVerifiedShippoShipmentParcels(
    result.parcelEntries
  )

  assert.deepEqual(payload, result.parcels)
  assert.deepEqual(
    payload.map(item => item.weight),
    ["23", "16"]
  )

  for (const item of payload) {
    assert.equal(item.packageId, undefined)
    assert.equal(item.shippoParcelTemplate, undefined)
    assert.equal(item.template, undefined)
  }
})

test("custom checkout packaging passes through adapter", async () => {
  setup({
    products: [product(customShipping)]
  })

  const result = await makeCartParcels(
    cart(1),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)

  const payload = buildVerifiedShippoShipmentParcels(
    result.parcelEntries
  )

  assert.deepEqual(payload, result.parcels)
  assert.equal(payload[0].weight, "9")
})

test("separately shipped checkout parcels retain individual payloads", async () => {
  setup({
    products: [product({
      ...savedShipping,
      shipSeparately: true
    })],
    profiles: [profile]
  })

  const result = await makeCartParcels(
    cart(5),
    [box],
    "signavi_studio"
  )

  assert.equal(result.error, undefined)

  const payload = buildVerifiedShippoShipmentParcels(
    result.parcelEntries
  )

  assert.equal(payload.length, 5)
  assert.deepEqual(
    payload.map(item => item.weight),
    ["9", "9", "9", "9", "9"]
  )
  assert.deepEqual(payload, result.parcels)
})

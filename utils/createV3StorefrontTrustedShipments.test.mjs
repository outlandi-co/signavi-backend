import test from "node:test"
import assert from "node:assert/strict"
import {
  createV3StorefrontTrustedShipments
} from "./createV3StorefrontTrustedShipments.js"

const productId = "507f1f77bcf86cd799439011"

const order = (overrides = {}) => ({
  storefront: "signavi_studio",
  customerName: "Test Customer",
  items: [{ productId, quantity: 2 }],
  address: {
    street: "Test Street",
    city: "Test City",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  ...overrides
})

function setup() {
  const calls = []
  let rateCalls = 0
  let packageCalls = 0

  const trusted = createV3StorefrontTrustedShipments({
    buildParcels: async (...args) => {
      calls.push(args)
      return {
        parcels: [{
          length: "12",
          width: "10",
          height: "4",
          weight: "16",
          distance_unit: "in",
          mass_unit: "oz"
        }]
      }
    },
    requestRates: async () => {
      rateCalls++
      return { rates: [{ object_id: "mock-rate" }] }
    },
    getPackages: async () => {
      packageCalls++
      return [{ id: "verified-package" }]
    },
    getShipFrom: () => ({ country: "US" }),
    getDestination: value => value,
    getToken: () => "mock-only-token"
  })

  return {
    trusted,
    calls,
    get rateCalls() { return rateCalls },
    get packageCalls() { return packageCalls }
  }
}

test("Studio order passes Studio storefront to parcel builder", async () => {
  const mock = setup()
  const shipments = await mock.trusted(order())

  assert.equal(mock.calls.length, 1)
  assert.equal(mock.calls[0][2], "signavi_studio")
  assert.equal(mock.calls[0][0][0].quantity, 2)
  assert.equal(mock.packageCalls, 1)
  assert.equal(shipments.length, 1)
})

test("Store order passes Store storefront explicitly", async () => {
  const mock = setup()
  await mock.trusted(order({ storefront: "signavi_store" }))
  assert.equal(mock.calls[0][2], "signavi_store")
})

test("missing and unknown storefronts fail closed", async () => {
  for (const storefront of [undefined, null, "", "unknown"]) {
    const mock = setup()
    await assert.rejects(
      mock.trusted(order({ storefront })),
      /Invalid saved-order storefront/
    )
    assert.equal(mock.calls.length, 0)
    assert.equal(mock.rateCalls, 0)
  }
})

test("conflicting item storefront fails closed", async () => {
  const mock = setup()

  await assert.rejects(
    mock.trusted(order({
      items: [{
        productId,
        quantity: 1,
        storefront: "signavi_store"
      }]
    })),
    /conflicting storefronts/
  )

  assert.equal(mock.rateCalls, 0)
})

test("failed fulfillment catalog blocks carrier calls", async () => {
  let requestedRates = 0

  const trusted = createV3StorefrontTrustedShipments({
    buildParcels: async () => {
      throw new Error("Should not pack")
    },
    requestRates: async () => {
      requestedRates++
      return { rates: [] }
    },
    getPackages: async () => [],
    getShipFrom: () => ({ country: "US" }),
    getDestination: value => value,
    getToken: () => "mock"
  })

  await assert.rejects(
    trusted(order()),
    /Shipping provider is not configured/
  )

  assert.equal(requestedRates, 0)
})

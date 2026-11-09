import test from "node:test"
import assert from "node:assert/strict"
import {
  fingerprintPreCatalogStorefrontOrder
} from "./storefrontPreCatalogFingerprint.mjs"

const original = {
  customerName: "Test Customer",
  email: "test@example.com",
  phone: "",
  address: {
    street: "Example Street",
    city: "Example City",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 1
  }]
}

const fingerprint = fingerprintPreCatalogStorefrontOrder

test("preserves the exact previously observed Store fingerprint", () => {
  assert.equal(
    fingerprint(original),
    "689b9befb4352898caba2aea89d4f54d8bfc2964bcfbc92eef5f6d9b634db118"
  )
  assert.equal(
    fingerprint({ ...original, storefront: "signavi_store" }),
    fingerprint(original)
  )
})

test("Studio and Store cannot have identical purchase fingerprints", () => {
  assert.notEqual(
    fingerprint(original),
    fingerprint({ ...original, storefront: "signavi_studio" })
  )
})

test("Studio artwork changes the purchase fingerprint", () => {
  const studio = {
    ...original,
    storefront: "signavi_studio",
    items: [{
      ...original.items[0],
      customization: {
        artwork: "https://example.com/flower.png",
        productionType: "dtf",
        printLocation: "front",
        design: { x: 150, y: 150, size: 120 }
      }
    }]
  }

  const otherArtwork = {
    ...studio,
    items: [{
      ...studio.items[0],
      customization: {
        ...studio.items[0].customization,
        artwork: "https://example.com/mountain.png"
      }
    }]
  }

  assert.notEqual(fingerprint(studio), fingerprint(otherArtwork))
})

test("Studio print location and design placement affect identity", () => {
  const base = {
    ...original,
    storefront: "signavi_studio",
    items: [{
      ...original.items[0],
      customization: {
        artwork: "https://example.com/design.png",
        productionType: "dtf",
        printLocation: "front",
        design: { x: 150, y: 150, size: 120 }
      }
    }]
  }

  const changedLocation = {
    ...base,
    items: [{
      ...base.items[0],
      customization: {
        ...base.items[0].customization,
        printLocation: "back"
      }
    }]
  }

  const changedPosition = {
    ...base,
    items: [{
      ...base.items[0],
      customization: {
        ...base.items[0].customization,
        design: { x: 180, y: 150, size: 120 }
      }
    }]
  }

  assert.notEqual(fingerprint(base), fingerprint(changedLocation))
  assert.notEqual(fingerprint(base), fingerprint(changedPosition))
})

test("identical Studio requests remain deterministic", () => {
  const studio = {
    ...original,
    storefront: "signavi_studio"
  }

  assert.equal(fingerprint(studio), fingerprint({ ...studio }))
})

test("mixed Store and Studio item channels are rejected", () => {
  assert.throws(
    () => fingerprint({
      ...original,
      storefront: "signavi_studio",
      items: [{
        ...original.items[0],
        storefront: "signavi_store"
      }]
    }),
    /different storefronts/
  )
})

test("invalid channel is rejected", () => {
  assert.throws(
    () => fingerprint({ ...original, storefront: "unknown" }),
    /Invalid storefront channel/
  )
})

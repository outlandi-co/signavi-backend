import assert from "node:assert/strict"
import {
  resolveV3ProductionPurchaseIdentity
} from "../utils/resolveV3ProductionPurchaseIdentity.js"

const orderId = "507f191e810c19729de860ea"
const invoiceId = "507f191e810c19729de860eb"

const order = {
  _id: orderId,
  squareEnvironment: "production"
}

const association = {
  orderId,
  invoiceId,
  environment: "production"
}

const lookup = {
  loadOrder: async id => id === orderId ? order : null,
  loadAssociation: async query =>
    query.orderId === orderId &&
    query.invoiceId === invoiceId &&
    query.environment === "production"
      ? association
      : null
}

const resolve = overrides =>
  resolveV3ProductionPurchaseIdentity({
    documentType: "order",
    documentId: orderId,
    orderId,
    ...lookup,
    ...overrides
  })

const orderIdentity = await resolve({})

assert.equal(orderIdentity.environment, "production")
assert.equal(orderIdentity.orderId, orderId)

console.log("PASS: Production order identity verified")

const invoiceIdentity = await resolve({
  documentType: "invoice",
  documentId: invoiceId
})

assert.equal(
  invoiceIdentity.purchaseKey,
  orderIdentity.purchaseKey
)

console.log("PASS: Associated invoice shares canonical purchase key")

assert.equal(
  invoiceIdentity.documentId,
  invoiceId
)

console.log("PASS: Invoice document identity retained")

await assert.rejects(
  resolve({
    documentType: "invoice",
    documentId: "507f191e810c19729de860ec"
  }),
  /PRODUCTION_ASSOCIATION_NOT_VERIFIED/
)

console.log("PASS: Unassociated invoice rejected")

await assert.rejects(
  resolve({
    documentType: "invoice",
    documentId: invoiceId,
    loadAssociation: async () => ({
      ...association,
      environment: "sandbox"
    })
  }),
  /PRODUCTION_ASSOCIATION_NOT_VERIFIED/
)

console.log("PASS: Sandbox association rejected")

await assert.rejects(
  resolve({
    loadOrder: async () => ({
      ...order,
      squareEnvironment: "sandbox"
    })
  }),
  /PRODUCTION_ORDER_NOT_VERIFIED/
)

console.log("PASS: Sandbox order rejected")

await assert.rejects(
  resolve({
    documentId: invoiceId
  }),
  /ORDER_IDENTITY_MISMATCH/
)

console.log("PASS: Incorrect order identity rejected")

await assert.rejects(
  resolve({
    documentId: "not-an-object-id"
  }),
  /INVALID_DOCUMENT_ID/
)

console.log("PASS: Invalid document identifier rejected")

await assert.rejects(
  resolve({
    loadOrder: null
  }),
  /TRUSTED_LOOKUPS_REQUIRED/
)

console.log("PASS: Missing trusted lookup rejected")

assert.equal(Object.isFrozen(orderIdentity), true)

console.log("PASS: Canonical identity result immutable")

console.log("")
console.log("PRODUCTION PURCHASE IDENTITY: 10 TESTS PASSED")
console.log("NO DATABASE CONNECTION")
console.log("NO RESERVATION WRITES")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")

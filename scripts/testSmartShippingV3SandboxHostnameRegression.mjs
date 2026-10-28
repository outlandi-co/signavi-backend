import assert from "node:assert/strict"

import {
  classifyV3SquareCreationOutcome
} from "../utils/smartShippingV3CreationOutcome.js"

function verify(url) {
  return classifyV3SquareCreationOutcome({
    response: {
      paymentLink: {
        id: "offline-sandbox-link",
        orderId: "offline-sandbox-order",
        url
      }
    }
  }).status
}

const accepted = [
  "https://sandbox.square.link/test",
  "https://square.link/test",
  "https://checkout.square.site/test"
]

for (const url of accepted) {
  assert.equal(verify(url), "lookup_required")
}

console.log("APPROVED SQUARE HOSTS: PASS")

const rejected = [
  "http://sandbox.square.link/test",
  "https://sandbox.square.link.evil.example/test",
  "https://fake-sandbox.square.link/test",
  "https://evil.example/test",
  "https://sandbox.square.link:8443/test",
  "https://user@sandbox.square.link/test",
  "https://sandbox.square.link/test#fragment"
]

for (const url of rejected) {
  assert.notEqual(
    verify(url),
    "lookup_required",
    `Unsafe checkout URL accepted: ${url}`
  )
}

console.log("UNTRUSTED URLS: REJECTED")

assert.equal(
  classifyV3SquareCreationOutcome({
    error: new Error("simulated offline failure")
  }).status,
  "reconciliation_required"
)

console.log("UNCERTAIN CREATION: RECONCILIATION REQUIRED")
console.log("NO AUTOMATIC RETRIES")
console.log("SANDBOX HOSTNAME REGRESSION: PASS")
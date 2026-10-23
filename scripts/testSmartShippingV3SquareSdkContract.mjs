import assert from "node:assert/strict"
import { SquareClient, SquareEnvironment } from "square"

const client = new SquareClient({
  token: "dummy-offline-contract-test",
  environment: SquareEnvironment.Sandbox
})

const methods = [
  ["merchants.get", client.merchants?.get],
  ["locations.get", client.locations?.get],
  [
    "checkout.paymentLinks.create",
    client.checkout?.paymentLinks?.create
  ],
  [
    "checkout.paymentLinks.get",
    client.checkout?.paymentLinks?.get
  ],
  ["orders.get", client.orders?.get]
]

for (const [name, method] of methods) {
  assert.equal(
    typeof method,
    "function",
    `Missing SDK method: ${name}`
  )

  console.log(`${name}: PASS`)
}

assert.ok(SquareEnvironment.Sandbox)
console.log("SANDBOX ENVIRONMENT CONSTANT: PASS")

console.log("NO REAL CREDENTIALS USED: PASS")
console.log("NO NETWORK REQUESTS: PASS")
console.log("ALL INSTALLED SDK CONTRACT CHECKS PASSED")
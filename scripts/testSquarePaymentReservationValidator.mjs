import assert from "node:assert/strict"
import {
  validateSquarePaymentCreationReservation
} from "../utils/validateSquarePaymentCreationReservation.js"

const orderId = "507f1f77bcf86cd799439011"
const environment = "sandbox"
const amountCents = 100

const reservation = {
  reserved: true,
  orderId,
  environment,
  amountCents,
  owner: "test-owner",
  idempotencyKey: `signavi-${environment}-${orderId}`,
  squareRequestAuthorized: false,
  paymentCreated: false
}

const validate = value =>
  validateSquarePaymentCreationReservation({
    reservation: value,
    orderId,
    environment,
    amountCents
  })

const valid = validate(reservation)

assert.equal(valid.valid, true)
assert.equal(valid.squareRequestAuthorized, false)
console.log("VALID RESERVATION: PASS")

for (const [name, value] of [
  ["MISSING", null],
  ["DUPLICATE", { ...reservation, reserved: false }],
  ["WRONG ORDER", {
    ...reservation,
    orderId: "507f1f77bcf86cd799439012"
  }],
  ["WRONG AMOUNT", { ...reservation, amountCents: 200 }],
  ["WRONG ENVIRONMENT", {
    ...reservation,
    environment: "production"
  }],
  ["MISSING OWNER", { ...reservation, owner: "" }],
  ["WRONG IDEMPOTENCY KEY", {
    ...reservation,
    idempotencyKey: "incorrect"
  }],
  ["UNAUTHORIZED FLAG", {
    ...reservation,
    squareRequestAuthorized: true
  }],
  ["PAYMENT CREATED FLAG", {
    ...reservation,
    paymentCreated: true
  }]
]) {
  const result = validate(value)

  assert.equal(result.valid, false, name)
  assert.equal(result.squareRequestAuthorized, false, name)

  console.log(`${name}: REJECTED`)
}

assert.throws(
  () => validateSquarePaymentCreationReservation({
    reservation,
    orderId: "invalid",
    environment,
    amountCents
  }),
  /Invalid payment reservation validation input/
)

console.log("INVALID INPUT: REJECTED")
console.log("ALL RESERVATION VALIDATOR TESTS PASSED")
console.log("NO DATABASE OR SQUARE REQUESTS")
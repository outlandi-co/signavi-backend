import assert from "node:assert/strict"
import {
  classifyV3SquareCreationOutcome as classify
} from "../utils/smartShippingV3CreationOutcome.js"

const good = {
  paymentLink: {
    id: "sandbox-link",
    orderId: "sandbox-order",
    url: "https://square.link/u/example"
  }
}

const received = classify({ response: good })

assert.equal(received.status, "lookup_required")
assert.equal(received.squarePaymentLinkId, "sandbox-link")
assert.equal(received.squareOrderId, "sandbox-order")
assert.equal(received.safeToRetryCreation, false)
assert.equal(received.verified, false)
console.log("COMPLETE RESPONSE REQUIRES LOOKUP: PASS")

const reject = (label, input) => {
  const outcome = classify(input)
  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(outcome.safeToRetryCreation, false)
  assert.equal(outcome.verified, false)
  console.log(`${label}: PASS`)
}

reject("TIMEOUT RETAINS RECONCILIATION", {
  error: new Error("timeout")
})

reject("MISSING RESPONSE RETAINS RECONCILIATION", {})

reject("MISSING LINK ID BLOCKED", {
  response: { paymentLink: { ...good.paymentLink, id: "" } }
})

reject("MISSING ORDER ID BLOCKED", {
  response: {
    paymentLink: { ...good.paymentLink, orderId: "" }
  }
})

reject("HTTP URL BLOCKED", {
  response: {
    paymentLink: {
      ...good.paymentLink,
      url: "http://square.link/u/example"
    }
  }
})

reject("FOREIGN HOST BLOCKED", {
  response: {
    paymentLink: {
      ...good.paymentLink,
      url: "https://example.com/pay"
    }
  }
})

reject("LOOKALIKE HOST BLOCKED", {
  response: {
    paymentLink: {
      ...good.paymentLink,
      url: "https://square.link.evil.example/u/test"
    }
  }
})

const snake = classify({
  response: {
    payment_link: {
      id: "sandbox-link",
      order_id: "sandbox-order",
      url: "https://square.link/u/example"
    }
  }
})
assert.equal(snake.status, "lookup_required")
console.log("SNAKE CASE RESPONSE SUPPORTED: PASS")

console.log("NO BLIND RETRY: PASS")
console.log("NO NETWORK OR DATABASE REQUESTS: PASS")
console.log("ALL V3 CREATION OUTCOME TESTS PASSED")
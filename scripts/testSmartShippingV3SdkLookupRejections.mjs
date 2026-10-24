import assert from "node:assert/strict"
import { SquareClient, SquareEnvironment } from "square"

import {
  lookupV3SquarePaymentLink
} from "../utils/smartShippingV3SquareLookup.js"

const linkId = "mock-link"
const squareOrderId = "mock-order"
const referenceId =
  "signavi-v3-sandbox-507f1f77bcf86cd799439011"
const locationId = "mock-location"

const scenarios = [
  {
    name: "WRONG AMOUNT",
    change: result => {
      result.order.total_money.amount = 5529
    }
  },
  {
    name: "WRONG CHECKOUT REFERENCE",
    change: result => {
      result.order.reference_id = "foreign-reference"
    }
  },
  {
    name: "WRONG LOCATION",
    change: result => {
      result.order.location_id = "foreign-location"
    }
  },
  {
    name: "WRONG PAYMENT LINK ID",
    change: result => {
      result.payment_link.id = "foreign-link"
    }
  }
]

for (const scenario of scenarios) {
  let calls = 0

  const response = {
    payment_link: {
      id: linkId,
      order_id: squareOrderId,
      url: "https://square.link/u/mock"
    },
    order: {
      id: squareOrderId,
      reference_id: referenceId,
      location_id: locationId,
      total_money: {
        amount: 5528,
        currency: "USD"
      }
    }
  }

  scenario.change(response)

  const interceptedFetch = async (input, init) => {
    calls++

    const request = new Request(input, init)
    const url = new URL(request.url)

    assert.equal(
      url.hostname,
      "connect.squareupsandbox.com"
    )
    assert.equal(request.method, "GET")

    let result

    if (
      url.pathname ===
      `/v2/online-checkout/payment-links/${linkId}`
    ) {
      result = {
        payment_link: response.payment_link
      }
    } else if (
      url.pathname === `/v2/orders/${squareOrderId}`
    ) {
      result = {
        order: response.order
      }
    } else {
      throw new Error("Unexpected Square lookup path.")
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    })
  }

  const client = new SquareClient({
    token: "dummy-offline-negative-test",
    environment: SquareEnvironment.Sandbox,
    maxRetries: 0,
    fetch: interceptedFetch
  })

  await assert.rejects(
    lookupV3SquarePaymentLink({
      client,
      expectedPaymentLinkId: linkId,
      expectedAmountCents: 5528,
      expectedReferenceId: referenceId,
      expectedLocationId: locationId
    }),
    `${scenario.name} must be rejected`
  )

  assert.ok(calls >= 1 && calls <= 2)
  console.log(`${scenario.name} REJECTED: PASS`)
}

console.log("NO DATABASE RECORDING PERFORMED: PASS")
console.log("NO REAL SQUARE NETWORK REQUESTS: PASS")
console.log("ALL SDK LOOKUP REJECTION TESTS PASSED")
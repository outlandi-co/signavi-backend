import {
  SquareClient,
  SquareEnvironment
} from "square"

// Dedicated, read-only Square Sandbox boundary.
//
// Does not reuse the production V2 Square client.
// Never selects Production.
// Exposes only payment-link and order retrieval methods.
// No Square requests happen during construction.

export const createV3SquareSandboxReader = ({
  environment,
  token,
  locationId,
  Client = SquareClient
}) => {
  if (
    typeof environment !== "string" ||
    environment.trim().toLowerCase() !== "sandbox"
  ) {
    throw new Error(
      "V3 Square reconciliation requires sandbox environment."
    )
  }

  if (
    typeof token !== "string" ||
    !token.trim() ||
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error(
      "V3 Square Sandbox configuration incomplete."
    )
  }

  const client = new Client({
    token: token.trim(),
    environment: SquareEnvironment.Sandbox
  })

  if (
    typeof client.checkout?.paymentLinks?.get !== "function" ||
    typeof client.orders?.get !== "function"
  ) {
    throw new Error(
      "V3 Square read-only SDK methods unavailable."
    )
  }

  const reader = Object.freeze({
    checkout: Object.freeze({
      paymentLinks: Object.freeze({
        get: args => client.checkout.paymentLinks.get(args)
      })
    }),
    orders: Object.freeze({
      get: args => client.orders.get(args)
    })
  })

  return Object.freeze({
    environment: "sandbox",
    locationId: locationId.trim(),
    client: reader
  })
}
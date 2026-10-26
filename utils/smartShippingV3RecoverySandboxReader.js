import {
  SquareClient,
  SquareEnvironment
} from "square"

import {
  verifyV3SandboxMerchantBinding
} from "./smartShippingV3SandboxMerchantBinding.js"

// Server-side read-only Sandbox boundary.
// No create method is exposed or called.
// Credentials and merchant/location expectations must
// originate from trusted server-side configuration.
export const createV3RecoverySandboxReader = ({
  token,
  expectedMerchantId,
  expectedLocationId,
  Client = SquareClient
} = {}) => {
  if (
    process.env.NODE_ENV !== "test" &&
    process.env.NODE_ENV !== "development"
  ) {
    throw new Error("V3 recovery Sandbox reader disabled.")
  }

  if (
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    typeof token !== "string" ||
    !token.trim() ||
    typeof expectedMerchantId !== "string" ||
    !expectedMerchantId.trim() ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("Invalid V3 recovery Sandbox configuration.")
  }

  const client = new Client({
    token: token.trim(),
    environment: SquareEnvironment.Sandbox
  })

  if (
    typeof client?.merchants?.get !== "function" ||
    typeof client?.locations?.get !== "function" ||
    typeof client?.checkout?.paymentLinks?.get !== "function" ||
    typeof client?.orders?.get !== "function"
  ) {
    throw new Error("Missing read-only Square SDK methods.")
  }

  let identityVerified = false

  const verifyIdentity = async () => {
    identityVerified = false

    const merchantResponse = await client.merchants.get({
      merchantId: expectedMerchantId
    })

    const locationResponse = await client.locations.get({
      locationId: expectedLocationId
    })

    const result = verifyV3SandboxMerchantBinding({
      environment: "sandbox",
      expectedMerchantId,
      expectedLocationId,
      merchantResponse,
      locationResponse
    })

    identityVerified =
      result.verified === true &&
      result.merchantId === expectedMerchantId &&
      result.locationId === expectedLocationId &&
      result.currency === "USD"

    return result
  }

  const requireIdentity = () => {
    if (!identityVerified) {
      throw new Error("V3 recovery Square identity not verified.")
    }
  }

  const lookupClient = Object.freeze({
    checkout: Object.freeze({
      paymentLinks: Object.freeze({
        get: async args => {
          requireIdentity()
          return client.checkout.paymentLinks.get(args)
        }
      })
    }),
    orders: Object.freeze({
      get: async args => {
        requireIdentity()
        return client.orders.get(args)
      }
    })
  })

  return Object.freeze({
    merchantId: expectedMerchantId,
    locationId: expectedLocationId,
    verifyIdentity,
    lookupClient
  })
}
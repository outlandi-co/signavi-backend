import {
  SquareClient,
  SquareEnvironment
} from "square"

import {
  verifyV3SandboxMerchantBinding
} from "./smartShippingV3SandboxMerchantBinding.js"

// Read-only, Sandbox-only merchant/location identity boundary.
// No Square requests during construction.
// Never exposes the full Square SDK client.

export const createV3SandboxIdentityReader = ({
  environment,
  token,
  expectedMerchantId,
  expectedLocationId,
  Client = SquareClient
}) => {
  if (
    environment !== "sandbox" ||
    typeof token !== "string" ||
    !token.trim() ||
    typeof expectedMerchantId !== "string" ||
    !expectedMerchantId.trim() ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error(
      "Invalid trusted V3 Sandbox identity configuration."
    )
  }

  const client = new Client({
    token: token.trim(),
    environment: SquareEnvironment.Sandbox
  })

  if (
    typeof client.merchants?.get !== "function" ||
    typeof client.locations?.get !== "function"
  ) {
    throw new Error(
      "Required Square identity methods unavailable."
    )
  }

  // Both calls use the same Sandbox SDK instance.
  const verifyIdentity = async () => {
    const merchantResponse = await client.merchants.get({
      merchantId: expectedMerchantId
    })

    const locationResponse = await client.locations.get({
      locationId: expectedLocationId
    })

    return verifyV3SandboxMerchantBinding({
      environment: "sandbox",
      expectedMerchantId,
      expectedLocationId,
      merchantResponse,
      locationResponse
    })
  }

  return Object.freeze({
    environment: "sandbox",
    verifyIdentity
  })
}
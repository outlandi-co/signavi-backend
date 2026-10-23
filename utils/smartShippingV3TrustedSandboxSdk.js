import {
  SquareClient,
  SquareEnvironment
} from "square"

import {
  bindV3SandboxClient
} from "./smartShippingV3BoundSandboxClient.js"

// Server-side Square SDK construction only.
// No Square request occurs during construction.
// Caller must separately enforce durable MongoDB
// claim and guarded creation sequencing.
//
// Never expose credentials or raw client to a browser.

export const createV3TrustedSandboxSdk = ({
  Client = SquareClient
} = {}) => {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true" ||
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "true"
  ) {
    throw new Error("V3 trusted Sandbox SDK disabled.")
  }

  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN
  const merchantId = process.env.SQUARE_SANDBOX_MERCHANT_ID
  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID

  if (
    typeof token !== "string" ||
    !token.trim() ||
    typeof merchantId !== "string" ||
    !merchantId.trim() ||
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error("Incomplete trusted Sandbox configuration.")
  }

  const client = new Client({
    token: token.trim(),
    environment: SquareEnvironment.Sandbox
  })

  const bound = bindV3SandboxClient({
    client,
    expectedMerchantId: merchantId.trim(),
    expectedLocationId: locationId.trim()
  })

  return Object.freeze({
    merchantId: merchantId.trim(),
    locationId: locationId.trim(),
    verifyIdentity: bound.verifyIdentity,
    createPaymentLink: bound.createPaymentLink,
    lookupClient: bound.lookupClient
  })
}
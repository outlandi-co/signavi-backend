import "dotenv/config"
import assert from "node:assert/strict"
import { SquareClient, SquareEnvironment } from "square"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  process.env.SMART_SHIPPING_V3_ENABLED === "true" ||
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED === "true"
) {
  throw new Error("STOP: Safe read-only Sandbox state required.")
}

const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN
const merchantId = process.env.SQUARE_SANDBOX_MERCHANT_ID
const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID

if (![token, merchantId, locationId].every(
  value => typeof value === "string" && value.trim()
)) {
  throw new Error("STOP: Sandbox credentials incomplete.")
}

const client = new SquareClient({
  token,
  environment: SquareEnvironment.Sandbox,
  maxRetries: 0,
  timeoutInSeconds: 15
})

try {
  const merchantResult = await client.merchants.get({
    merchantId
  })

  const merchant = merchantResult.merchant

  assert.equal(merchant?.id, merchantId)
  assert.equal(merchant?.status, "ACTIVE")
  assert.equal(merchant?.currency, "USD")

  console.log("SANDBOX MERCHANT AUTHENTICATED: PASS")

  const locationResult = await client.locations.get({
    locationId
  })

  const location = locationResult.location

  assert.equal(location?.id, locationId)
  assert.equal(location?.merchantId, merchantId)
  assert.equal(location?.status, "ACTIVE")
  assert.equal(location?.currency, "USD")

  console.log("SANDBOX LOCATION ASSOCIATION: PASS")
  console.log("ACTIVE USD MERCHANT AND LOCATION: PASS")
  console.log("NO PAYMENT CREATION REQUESTS: PASS")
  console.log("LIVE READ-ONLY SANDBOX IDENTITY VERIFIED")
} catch (error) {
  // Do not print the error object: it may contain
  // transport headers or other sensitive details.
  console.error("SANDBOX IDENTITY CHECK FAILED")
  console.error("Check Sandbox token, merchant and location IDs.")
  process.exitCode = 1
}
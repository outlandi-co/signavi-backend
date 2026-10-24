const nonempty = value =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0

// Pure verifier of Square merchant and location data.
//
// Both Square responses must eventually come from the
// SAME trusted Sandbox client/access token.
//
// Expected IDs must come from trusted server configuration,
// never customer requests.
//
// Does not perform network calls, database writes,
// request reservations, or payment authorization.

export const verifyV3SandboxMerchantBinding = ({
  environment,
  expectedMerchantId,
  expectedLocationId,
  merchantResponse,
  locationResponse
}) => {
  const reject = reason => Object.freeze({
    verified: false,
    reason,
    squareRequestAuthorized: false
  })

  if (
    environment !== "sandbox" ||
    !nonempty(expectedMerchantId) ||
    !nonempty(expectedLocationId)
  ) {
    return reject("invalid_trusted_configuration")
  }

  const merchant = merchantResponse?.merchant
  const location = locationResponse?.location

  if (
    !merchant ||
    !location ||
    !nonempty(merchant.id) ||
    !nonempty(location.id)
  ) {
    return reject("missing_square_identity")
  }

  if (merchant.id !== expectedMerchantId) {
    return reject("merchant_identity_mismatch")
  }

  if (location.id !== expectedLocationId) {
    return reject("location_identity_mismatch")
  }

  const locationMerchantId =
    location.merchantId ?? location.merchant_id

  if (
    !nonempty(locationMerchantId) ||
    locationMerchantId !== merchant.id
  ) {
    return reject("location_merchant_mismatch")
  }

  if (
    merchant.status !== "ACTIVE" ||
    location.status !== "ACTIVE"
  ) {
    return reject("inactive_square_merchant_or_location")
  }

  if (
    merchant.currency !== "USD" ||
    location.currency !== "USD"
  ) {
    return reject("square_currency_mismatch")
  }

  return Object.freeze({
    verified: true,
    reason: "sandbox_merchant_location_consistent",
    merchantId: merchant.id,
    locationId: location.id,
    currency: "USD",
    squareRequestAuthorized: false
  })
}
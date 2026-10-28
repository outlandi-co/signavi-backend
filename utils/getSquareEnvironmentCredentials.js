function selectedSquareConfiguration() {
  const environment =
    String(process.env.SQUARE_ENVIRONMENT || "")
      .trim()
      .toLowerCase()

  if (environment === "production") {
    return {
      environment,
      accessToken:
        process.env.SQUARE_PRODUCTION_ACCESS_TOKEN,
      locationId:
        process.env.SQUARE_PRODUCTION_LOCATION_ID
    }
  }

  if (environment === "sandbox") {
    return {
      environment,
      accessToken:
        process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
      locationId:
        process.env.SQUARE_SANDBOX_LOCATION_ID
    }
  }

  return null
}

// Strict function for operations requiring a complete
// and explicitly selected Square configuration.
export function getSquareEnvironmentCredentials() {
  const config = selectedSquareConfiguration()

  if (!config) {
    throw new Error("SQUARE_ENVIRONMENT_INVALID")
  }

  const accessToken = String(
    config.accessToken || ""
  ).trim()

  const locationId = String(
    config.locationId || ""
  ).trim()

  if (!accessToken) {
    throw new Error("SQUARE_ENVIRONMENT_TOKEN_MISSING")
  }

  if (!locationId) {
    throw new Error("SQUARE_ENVIRONMENT_LOCATION_MISSING")
  }

  return Object.freeze({
    environment: config.environment,
    accessToken,
    locationId
  })
}

// Compatibility getters preserve existing route
// startup behavior when Square is unconfigured.
export function getSquareAccessToken() {
  const config = selectedSquareConfiguration()
  return String(config?.accessToken || "").trim()
}

export function getSquareLocationId() {
  const config = selectedSquareConfiguration()
  return String(config?.locationId || "").trim()
}

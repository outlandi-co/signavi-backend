
import {
  SquareClient,
  SquareEnvironment
} from "square"

/**
 * Server-only Square checkout client factory.
 *
 * Does not authorize checkout, claim payment identities,
 * create links, or initiate payment.
 */
export function createV3ProductionCheckoutClient() {
  if (
    String(process.env.SQUARE_ENVIRONMENT || "")
      .trim()
      .toLowerCase() !== "production"
  ) {
    throw new Error("PRODUCTION_SQUARE_ENVIRONMENT_REQUIRED")
  }

  const token = process.env.SQUARE_PRODUCTION_ACCESS_TOKEN
  const locationId = process.env.SQUARE_PRODUCTION_LOCATION_ID

  if (
    typeof token !== "string" ||
    !token.trim() ||
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error("PRODUCTION_SQUARE_CONFIGURATION_REQUIRED")
  }

  const client = new SquareClient({
    token,
    environment: SquareEnvironment.Production
  })

  if (
    typeof client.checkout?.paymentLinks?.create !== "function"
  ) {
    throw new Error("SQUARE_PAYMENT_LINK_CLIENT_UNAVAILABLE")
  }

  return Object.freeze({
    checkoutClient: client.checkout,
    locationId
  })
}

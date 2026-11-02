
import {
  resolveV3TrustedCheckoutHandoff
} from "./resolveV3TrustedCheckoutHandoff.js"

import {
  createV3CheckoutHttpResponse
} from "./createV3CheckoutHttpResponse.js"

/**
 * Server-only HTTP response orchestration.
 *
 * The activation result must come from the trusted
 * production coordinator, never the browser.
 *
 * The checkout executor must be constructed by
 * trusted backend code with server-owned dependencies.
 *
 * This function does not authenticate HTTP requests,
 * initialize payments, or create Square clients.
 */
export async function runV3CheckoutHttpHandoff({
  activation,
  executeTrustedCheckout,
  redirectUrl
} = {}) {
  const handoff = await resolveV3TrustedCheckoutHandoff({
  activation,
  executeTrustedCheckout,
  redirectUrl
})

  return createV3CheckoutHttpResponse(handoff)
}

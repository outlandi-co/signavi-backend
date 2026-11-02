
const approvedHosts = new Set([
  "signavistudio.store",
  "www.signavistudio.store"
])

export function resolveV3ProductionCheckoutRedirect({
  clientUrl = process.env.CLIENT_URL
} = {}) {
  if (
    typeof clientUrl !== "string" ||
    !clientUrl.trim()
  ) {
    throw new Error("STOREFRONT_URL_REQUIRED")
  }

  let origin

  try {
    origin = new URL(clientUrl)
  } catch {
    throw new Error("INVALID_STOREFRONT_URL")
  }

  if (
    origin.protocol !== "https:" ||
    !approvedHosts.has(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error("UNAPPROVED_STOREFRONT_ORIGIN")
  }

  return new URL(
    "/checkout/success",
    origin.origin
  ).href
}

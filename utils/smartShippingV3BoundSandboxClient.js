import {
  verifyV3SandboxMerchantBinding
} from "./smartShippingV3SandboxMerchantBinding.js"

// Binds identity verification, creation and read-only
// lookup to ONE server-owned Square SDK instance.
//
// Does not construct a client or perform network calls.
// Actual creation remains governed by the separate
// execution gate and durable MongoDB claim.

export const bindV3SandboxClient = ({
  client,
  expectedMerchantId,
  expectedLocationId
}) => {
  if (
    typeof expectedMerchantId !== "string" ||
    !expectedMerchantId.trim() ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim() ||
    typeof client?.merchants?.get !== "function" ||
    typeof client?.locations?.get !== "function" ||
    typeof client?.checkout?.paymentLinks?.create !== "function" ||
    typeof client?.checkout?.paymentLinks?.get !== "function" ||
    typeof client?.orders?.get !== "function"
  ) {
    throw new Error("Invalid V3 bound Sandbox client.")
  }

  let verified = false

  const verifyIdentity = async () => {
    // Fail closed if a subsequent verification fails.
    verified = false

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

    verified =
      result?.verified === true &&
      result.merchantId === expectedMerchantId &&
      result.locationId === expectedLocationId

    return result
  }

  const createPaymentLink = async request => {
    if (!verified) {
      throw new Error("V3 Square identity not verified.")
    }

    // The guarded executor must call this only after
    // the durable MongoDB creation claim succeeds.
    verified = false
    return client.checkout.paymentLinks.create(request)
  }

  return Object.freeze({
    verifyIdentity,
    createPaymentLink,
    lookupClient: Object.freeze({
      checkout: Object.freeze({
        paymentLinks: Object.freeze({
          get: args => client.checkout.paymentLinks.get(args)
        })
      }),
      orders: Object.freeze({
        get: args => client.orders.get(args)
      })
    })
  })
}
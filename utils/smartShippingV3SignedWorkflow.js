import { calculateV3ApparelShipping } from "./smartShippingV3Workflow.js"
import { signV3ShippingOptions } from "./smartShippingV3SignedOptions.js"

export const calculateV3SignedApparelShipping = async ({
  cartFingerprint,
  now = Date.now(),
  ...shippingInput
}) => {
  if (
    typeof cartFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(cartFingerprint)
  ) {
    throw new Error("Invalid V3 cart fingerprint.")
  }

  // Packing, Shippo quotes and quote integrity validation
  // are handled by the existing V3 workflow.
  const result = await calculateV3ApparelShipping(shippingInput)

  if (!result.success) {
    return result
  }

  const signedOptions = signV3ShippingOptions({
    options: result.shippingOptions,
    verifiedRates: result.rates,
    parcelCount: result.parcelCount,
    cartFingerprint,
    now
  })

  if (signedOptions.length === 0) {
    return {
      ...result,
      success: false,
      shippingOptions: [],
      error: "No valid signed shipping options available."
    }
  }

  return {
    ...result,
    shippingOptions: signedOptions
  }
}
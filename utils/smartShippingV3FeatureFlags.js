export const isSmartShippingV3Enabled = () =>
  String(process.env.SMART_SHIPPING_V3_ENABLED || "")
    .trim()
    .toLowerCase() === "true" &&
  ["development", "test"].includes(String(process.env.NODE_ENV || "").trim().toLowerCase())

export const getSmartShippingCheckoutVersion = () =>
  isSmartShippingV3Enabled() ? "v3" : "v2"
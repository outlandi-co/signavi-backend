const supportedUspsFlatRateTemplates = new Set([
  "USPS_FlatRateEnvelope",
  "USPS_FlatRatePaddedEnvelope",
  "USPS_SmallFlatRateBox",
  "USPS_MediumFlatRateBox1",
  "USPS_MediumFlatRateBox2",
  "USPS_LargeFlatRateBox"
])

export const isSupportedUspsFlatRateTemplate = (token) =>
  typeof token === "string" &&
  supportedUspsFlatRateTemplates.has(token)
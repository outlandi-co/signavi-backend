export const getTrackingLink = (trackingNumber) => {
  if (!trackingNumber) return null

  /* UPS */
  if (trackingNumber.startsWith("1Z")) {
    return `https://www.ups.com/track?tracknum=${trackingNumber}`
  }

  /* USPS (default) */
  return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${trackingNumber}`
}
// Determines whether a previously validated package may
// be quoted using ordinary dimensions and weight.
//
// Carrier-specific parcel templates need their own
// request construction and service eligibility checks.
export function isDimensionRateEligible(box) {
  if (!box || typeof box !== "object" || Array.isArray(box)) {
    return false
  }

  if (box.uspsFlatRate !== false) {
    return false
  }

  if (typeof box.shippoParcelTemplate !== "string") {
    return false
  }

  return box.shippoParcelTemplate.trim() === ""
}

export function selectPreferredShippingPackage({
  candidates,
  packages,
  productShipping,
  quantity
}) {
  if (!Array.isArray(candidates) ||
      !Array.isArray(packages) ||
      !Number.isInteger(quantity) ||
      quantity < 1) {
    return null
  }

  const mode = productShipping?.mode ?? "product_measurements"

  if (mode === "per_order") {
    return null
  }

  if (mode === "product_measurements") {
    return candidates[0] ?? null
  }

  if (mode !== "saved_package") {
    return null
  }

  const preferredId = String(productShipping?.packageId ?? "")

  if (!/^[a-f0-9]{24}$/i.test(preferredId)) {
    return null
  }

  // The preferred package must still exist in the active,
  // validated package catalog.
  const preferredPackage = packages.find(
    (box) => String(box.id).toLowerCase() === preferredId.toLowerCase()
  )

  if (!preferredPackage) {
    return null
  }

  // Use the selected package when it can hold the whole quantity.
  const preferredCandidate = candidates.find(
    (candidate) =>
      String(candidate.box?.id).toLowerCase() === preferredId.toLowerCase()
  )

  if (preferredCandidate?.perParcel >= quantity) {
    return preferredCandidate
  }

  // Larger quantities can use another compatible package.
  // Candidates were already checked for fit and weight,
  // then sorted by parcel count and volume.
  return candidates[0] ?? null
}

import {
  buildVerifiedSavedPackageParcels
} from "../utils/buildVerifiedSavedPackageParcels.mjs";

const ID = /^[a-f0-9]{24}$/i;

function outcome(code, message, matchingActiveProfiles = 0) {
  return Object.freeze({
    code,
    message,
    matchingActiveProfiles,
    readOnly: true,
    profileMutationAuthorized: false,
    shippingBypassAuthorized: false,
    paymentAuthorized: false
  });
}

export function diagnoseSavedPackageProfile({
  productId,
  selectedPackageId,
  quantity = 1,
  packages,
  profiles,
  shipSeparately = false
} = {}) {
  if (
    typeof productId !== "string" ||
    !ID.test(productId) ||
    typeof selectedPackageId !== "string" ||
    !ID.test(selectedPackageId) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 200 ||
    !Array.isArray(packages) ||
    !Array.isArray(profiles) ||
    typeof shipSeparately !== "boolean"
  ) {
    return outcome(
      "INVALID_DIAGNOSTIC_INPUT",
      "Trusted shipping inputs are invalid."
    );
  }

  const normalize = value =>
    String(value ?? "").toLowerCase();

  const associated = profiles.filter(profile =>
    profile &&
    normalize(profile.productId) === normalize(productId) &&
    normalize(profile.packageId) === normalize(selectedPackageId)
  );

  const active = associated.filter(
    profile => profile.active === true
  );

  if (active.length === 0) {
    return outcome(
      associated.length > 0
        ? "NO_ACTIVE_PROFILE"
        : "PROFILE_NOT_FOUND",
      associated.length > 0
        ? "Matching profiles exist but none is active."
        : "No matching product/package profile was supplied."
    );
  }

  if (active.length > 1) {
    return outcome(
      "DUPLICATE_ACTIVE_PROFILES",
      "Multiple active profiles match this product/package.",
      active.length
    );
  }

  const result = buildVerifiedSavedPackageParcels({
    productId,
    selectedPackageId,
    quantity,
    packages,
    profiles,
    shipSeparately
  });

  if (result.error) {
    return outcome(
      result.error === "Verified packing information is incomplete."
        ? "INCOMPLETE_VERIFICATION"
        : "PARCEL_VALIDATION_FAILED",
      result.error,
      active.length
    );
  }

  return outcome(
    "PROFILE_VALID_FOR_REVIEW",
    "Saved-package parcel validation passed locally.",
    active.length
  );
}

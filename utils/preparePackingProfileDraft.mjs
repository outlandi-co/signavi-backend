import {
  validatePackingProfileCreation
} from "./validatePackingProfileCreation.mjs";

import {
  validatePackingProfileRelationship
} from "./validatePackingProfileRelationship.mjs";

const reject = error => ({
  valid: false,
  error
});

export function preparePackingProfileDraft({
  input,
  product,
  shippingPackage
} = {}) {
  const creation = validatePackingProfileCreation(input);

  if (!creation.valid) {
    return creation;
  }

  const relationship = validatePackingProfileRelationship({
    product,
    shippingPackage,
    expectedStorefront: "signavi_studio"
  });

  if (!relationship.valid) {
    return relationship;
  }

  const id = value => String(value ?? "").toLowerCase();

  if (
    id(creation.data.productId) !== relationship.productId ||
    id(creation.data.packageId) !== relationship.packageId
  ) {
    return reject("Profile identifiers do not match trusted records");
  }

  const packageWeight =
    shippingPackage.tareWeightOz +
    creation.data.unitWeightOz * creation.data.verifiedCapacity;

  if (
    !Number.isFinite(packageWeight) ||
    Math.ceil(packageWeight) > shippingPackage.maxWeightOz
  ) {
    return reject("Verified capacity exceeds package weight limit");
  }

  return {
    valid: true,
    data: {
      ...creation.data,
      active: false
    },
    storefront: relationship.storefront
  };
}

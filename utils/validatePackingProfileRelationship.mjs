const id = value => String(value ?? "").toLowerCase();

const validPositive = value =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0;

const reject = error => ({
  valid: false,
  error
});

export function validatePackingProfileRelationship({
  product,
  shippingPackage,
  expectedStorefront = "signavi_studio"
} = {}) {
  if (!product || !shippingPackage) {
    return reject("Product and package must exist");
  }

  if (
    product.storefront !== expectedStorefront ||
    product.salesChannel !== expectedStorefront
  ) {
    return reject("Product storefront ownership mismatch");
  }

  if (product.productType !== "physical") {
    return reject("Only physical products require packing profiles");
  }

  if (product.shipping?.mode !== "saved_package") {
    return reject("Product must use saved-package shipping");
  }

  if (
    !shippingPackage._id ||
    id(product.shipping?.packageId) !== id(shippingPackage._id)
  ) {
    return reject("Selected package does not match product");
  }

  if (shippingPackage.active !== true) {
    return reject("Shipping package is inactive");
  }

  if (
    product.shipping?.packagingType !== shippingPackage.type
  ) {
    return reject("Shipping package type mismatch");
  }

  if (
    !validPositive(shippingPackage.lengthIn) ||
    !validPositive(shippingPackage.widthIn) ||
    !validPositive(shippingPackage.heightIn) ||
    !validPositive(shippingPackage.maxWeightOz) ||
    typeof shippingPackage.tareWeightOz !== "number" ||
    !Number.isFinite(shippingPackage.tareWeightOz) ||
    shippingPackage.tareWeightOz < 0 ||
    shippingPackage.maxWeightOz <= shippingPackage.tareWeightOz
  ) {
    return reject("Shipping package specifications are invalid");
  }

  // USPS Flat Rate requires a separate, verified carrier integration.
  if (shippingPackage.uspsFlatRate === true) {
    return reject("USPS Flat Rate integration is not approved");
  }

  return {
    valid: true,
    productId: id(product._id),
    packageId: id(shippingPackage._id),
    storefront: expectedStorefront
  };
}

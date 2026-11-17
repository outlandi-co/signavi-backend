export function shouldInitializeIsolatedDatabases({
  environment,
  productIsolation,
  shippingProfileIsolation
}) {
  if (environment === "production") {
    return false;
  }

  return (
    productIsolation === "true" ||
    shippingProfileIsolation === "true"
  );
}

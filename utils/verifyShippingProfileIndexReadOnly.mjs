const blocked = reason => Object.freeze({
  verified: false,
  reason
});

const DATABASES = new Set([
  "signavi_studio",
  "signavi_store"
]);

export async function verifyShippingProfileIndexReadOnly({
  model,
  expectedDatabase
} = {}) {
  if (!DATABASES.has(expectedDatabase)) {
    return blocked("INVALID_EXPECTED_DATABASE");
  }

  if (
    !model ||
    model.modelName !== "ShippingProductPackageProfile" ||
    model.db?.name !== expectedDatabase ||
    model.db?.readyState !== 1 ||
    model.collection?.name !== "shippingproductpackageprofiles" ||
    model.collection?.conn !== model.db ||
    typeof model.collection?.listIndexes !== "function"
  ) {
    return blocked("SHIPPING_PROFILE_MODEL_BINDING_INVALID");
  }

  let indexes;

  try {
    indexes = await model.collection.listIndexes().toArray();
  } catch {
    return blocked("SHIPPING_PROFILE_INDEX_INSPECTION_FAILED");
  }

  if (!Array.isArray(indexes)) {
    return blocked("SHIPPING_PROFILE_INDEX_RESPONSE_INVALID");
  }

  const matches = indexes.some(index => {
    if (!index || !index.key) return false;

    const keys = Object.keys(index.key);

    return (
      keys.length === 2 &&
      keys[0] === "productId" &&
      keys[1] === "packageId" &&
      index.key.productId === 1 &&
      index.key.packageId === 1 &&
      index.unique === true &&
      index.sparse !== true &&
      index.partialFilterExpression == null &&
      index.collation == null &&
      index.expireAfterSeconds == null &&
      index.hidden !== true
    );
  });

  if (!matches) {
    return blocked("SHIPPING_PROFILE_UNIQUE_INDEX_MISSING");
  }

  return Object.freeze({
    verified: true,
    reason: "SHIPPING_PROFILE_UNIQUE_INDEX_PRESENT"
  });
}
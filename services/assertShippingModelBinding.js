const DATABASES = new Set([
  "signavi_store",
  "signavi_studio"
]);

const COLLECTIONS = Object.freeze({
  ShippingPackage: "shippingpackages",
  ShippingProductPackageProfile: "shippingproductpackageprofiles"
});

export function assertShippingModelBinding(model, channel, modelName) {
  if (!DATABASES.has(channel)) {
    throw new Error("INVALID_SHIPPING_CHANNEL");
  }

  const expectedCollection = COLLECTIONS[modelName];

  if (!expectedCollection) {
    throw new Error("INVALID_SHIPPING_MODEL");
  }

  if (
    !model ||
    !model.db ||
    model.db.name !== channel ||
    model.db.readyState !== 1 ||
    model.modelName !== modelName ||
    model.collection?.name !== expectedCollection ||
    model.collection?.conn !== model.db
  ) {
    throw new Error("SHIPPING_DATABASE_BINDING_MISMATCH");
  }

  return model;
}

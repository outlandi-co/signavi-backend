import {
  verifyShippingProfileIndexReadOnly
} from "./verifyShippingProfileIndexReadOnly.mjs";

const COLLECTION = "shippingproductpackageprofiles";

const blocked = (reason, nextAction) => Object.freeze({
  ready: false,
  reason,
  nextAction,
  writesAuthorized: false
});

export async function planShippingProfileMigration({
  connection,
  expectedDatabase
} = {}) {
  if (!["signavi_store", "signavi_studio"].includes(expectedDatabase)) {
    return blocked("INVALID_DATABASE", "STOP");
  }

  if (
    connection?.name !== expectedDatabase ||
    connection?.readyState !== 1 ||
    typeof connection.db?.listCollections !== "function"
  ) {
    return blocked("DATABASE_BINDING_INVALID", "STOP");
  }

  let collections;

  try {
    collections = await connection.db.listCollections(
      { name: COLLECTION },
      { nameOnly: true }
    ).toArray();
  } catch {
    return blocked("COLLECTION_INSPECTION_FAILED", "STOP");
  }

  if (!Array.isArray(collections)) {
    return blocked("COLLECTION_RESPONSE_INVALID", "STOP");
  }

  if (collections.length === 0) {
    return blocked(
      "PROFILE_COLLECTION_MISSING",
      "REVIEW_COLLECTION_CREATION"
    );
  }

  if (
    collections.length !== 1 ||
    collections[0]?.name !== COLLECTION
  ) {
    return blocked("COLLECTION_IDENTITY_INVALID", "STOP");
  }

  let model;

  try {
    model = connection.model("ShippingProductPackageProfile");
  } catch {
    return blocked("PROFILE_MODEL_UNAVAILABLE", "STOP");
  }

  const index = await verifyShippingProfileIndexReadOnly({
    model,
    expectedDatabase
  });

  if (!index.verified) {
    return blocked(
      index.reason,
      "REVIEW_UNIQUE_INDEX_MIGRATION"
    );
  }

  return Object.freeze({
    ready: true,
    reason: "PROFILE_COLLECTION_AND_INDEX_VERIFIED",
    nextAction: "REVIEW_PROFILE_PROVISIONING",
    writesAuthorized: false
  });
}
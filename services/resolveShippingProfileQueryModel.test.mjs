import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveShippingProfileQueryModel
} from "./resolveShippingProfileQueryModel.js";

function model(channel) {
  const db = { name: channel, readyState: 1 };

  return {
    db,
    modelName: "ShippingProductPackageProfile",
    collection: {
      name: "shippingproductpackageprofiles",
      conn: db
    },
    find() {
      return [];
    }
  };
}

const legacy = model("signavi_store");
const studio = model("signavi_studio");
const store = model("signavi_store");

test("Production always preserves legacy lookup", () => {
  let isolatedCalled = false;

  const result = resolveShippingProfileQueryModel(
    "signavi_studio",
    {
      legacyModel: legacy,
      enabled: true,
      environment: "production",
      isolatedModelResolver: () => {
        isolatedCalled = true;
        return studio;
      }
    }
  );

  assert.equal(result, legacy);
  assert.equal(isolatedCalled, false);
});

test("Disabled isolation preserves legacy lookup", () => {
  const result = resolveShippingProfileQueryModel(
    "signavi_studio",
    {
      legacyModel: legacy,
      enabled: false,
      environment: "development"
    }
  );

  assert.equal(result, legacy);
});

test("Development Studio selects Studio profile model", () => {
  const result = resolveShippingProfileQueryModel(
    "signavi_studio",
    {
      legacyModel: legacy,
      enabled: true,
      environment: "development",
      isolatedModelResolver: () => studio
    }
  );

  assert.equal(result, studio);
});

test("Development Store selects Store profile model", () => {
  const result = resolveShippingProfileQueryModel(
    "signavi_store",
    {
      legacyModel: legacy,
      enabled: true,
      environment: "development",
      isolatedModelResolver: () => store
    }
  );

  assert.equal(result, store);
});

test("Studio rejects Store profile model", () => {
  assert.throws(
    () => resolveShippingProfileQueryModel(
      "signavi_studio",
      {
        legacyModel: legacy,
        enabled: true,
        environment: "development",
        isolatedModelResolver: () => store
      }
    ),
    /SHIPPING_PROFILE_DATABASE_BINDING_MISMATCH/
  );
});

test("Invalid channel fails closed", () => {
  assert.throws(
    () => resolveShippingProfileQueryModel(
      "unknown",
      {
        legacyModel: legacy,
        enabled: false
      }
    ),
    /INVALID_SHIPPING_CHANNEL/
  );
});

test("Invalid isolation flag fails closed", () => {
  assert.throws(
    () => resolveShippingProfileQueryModel(
      "signavi_studio",
      {
        legacyModel: legacy,
        enabled: "true"
      }
    ),
    /INVALID_SHIPPING_ISOLATION_FLAG/
  );
});

test("Missing legacy model fails closed", () => {
  assert.throws(
    () => resolveShippingProfileQueryModel(
      "signavi_studio",
      {
        enabled: false
      }
    ),
    /LEGACY_SHIPPING_PROFILE_MODEL_UNAVAILABLE/
  );
});

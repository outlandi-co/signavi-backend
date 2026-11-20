import assert from "node:assert/strict";
import test from "node:test";

import {
  bindShippingProfileModel,
  getShippingProfileModelForChannel
} from "./ShippingProfileForChannel.js";

function makeConnection(channel) {
  const connection = {
    name: channel,
    readyState: 1,
    models: {},
    calls: 0,

    model(name, schema, collectionName) {
      this.calls++;

      assert.equal(
        schema.options.autoIndex,
        false
      );

      assert.equal(
        schema.options.autoCreate,
        false
      );

      const model = {
        db: this,
        modelName: name,
        collection: {
          name: collectionName,
          conn: this
        }
      };

      this.models[name] = model;

      return model;
    }
  };

  return connection;
}

test("Studio profiles bind to Studio", () => {
  const connection = makeConnection("signavi_studio");

  const model = bindShippingProfileModel(
    connection,
    "signavi_studio"
  );

  assert.equal(model.db.name, "signavi_studio");
  assert.equal(connection.calls, 1);
});

test("Store profiles bind to Store", () => {
  const connection = makeConnection("signavi_store");

  const model = bindShippingProfileModel(
    connection,
    "signavi_store"
  );

  assert.equal(model.db.name, "signavi_store");
});

test("Studio rejects Store connection", () => {
  const connection = makeConnection("signavi_store");

  assert.throws(
    () => bindShippingProfileModel(
      connection,
      "signavi_studio"
    ),
    /SHIPPING_DATABASE_BINDING_MISMATCH/
  );

  assert.equal(connection.calls, 0);
});

test("Disconnected connection fails closed", () => {
  const connection = makeConnection("signavi_studio");
  connection.readyState = 0;

  assert.throws(
    () => bindShippingProfileModel(
      connection,
      "signavi_studio"
    ),
    /SHIPPING_DATABASE_BINDING_MISMATCH/
  );

  assert.equal(connection.calls, 0);
});

test("Existing model is reused", () => {
  const connection = makeConnection("signavi_studio");

  const first = bindShippingProfileModel(
    connection,
    "signavi_studio"
  );

  const second = bindShippingProfileModel(
    connection,
    "signavi_studio"
  );

  assert.equal(first, second);
  assert.equal(connection.calls, 1);
});

test("Incorrect existing model is rejected", () => {
  const connection = makeConnection("signavi_studio");

  connection.models.ShippingProductPackageProfile = {
    db: connection,
    modelName: "ShippingProductPackageProfile",
    collection: {
      name: "products",
      conn: connection
    }
  };

  assert.throws(
    () => bindShippingProfileModel(
      connection,
      "signavi_studio"
    ),
    /SHIPPING_DATABASE_BINDING_MISMATCH/
  );
});

test("Invalid channel fails before database access", () => {
  assert.throws(
    () => getShippingProfileModelForChannel("unknown"),
    /INVALID_SHIPPING_CHANNEL/
  );
});

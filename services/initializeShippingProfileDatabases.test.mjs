import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeShippingProfileDatabases
} from "./initializeShippingProfileDatabases.js";

function makeConnectors() {
  const calls = [];

  return {
    calls,
    connectStore: async () => {
      calls.push("store");
    },
    connectStudio: async () => {
      calls.push("studio");
    }
  };
}

test("Production never initializes isolated connections", async () => {
  const mock = makeConnectors();

  const result = await initializeShippingProfileDatabases({
    ...mock,
    enabled: true,
    environment: "production"
  });

  assert.equal(result, false);
  assert.deepEqual(mock.calls, []);
});

test("Disabled feature does not initialize connections", async () => {
  const mock = makeConnectors();

  const result = await initializeShippingProfileDatabases({
    ...mock,
    enabled: false,
    environment: "development"
  });

  assert.equal(result, false);
  assert.deepEqual(mock.calls, []);
});

test("Enabled development initializes Store then Studio", async () => {
  const mock = makeConnectors();

  const result = await initializeShippingProfileDatabases({
    ...mock,
    enabled: true,
    environment: "development"
  });

  assert.equal(result, true);
  assert.deepEqual(mock.calls, ["store", "studio"]);
});

test("Store connection failure prevents Studio initialization", async () => {
  const calls = [];

  await assert.rejects(
    initializeShippingProfileDatabases({
      enabled: true,
      environment: "development",
      connectStore: async () => {
        calls.push("store");
        throw new Error("STORE_CONNECT_FAILED");
      },
      connectStudio: async () => {
        calls.push("studio");
      }
    }),
    /STORE_CONNECT_FAILED/
  );

  assert.deepEqual(calls, ["store"]);
});

test("Studio connection failure propagates", async () => {
  await assert.rejects(
    initializeShippingProfileDatabases({
      enabled: true,
      environment: "development",
      connectStore: async () => {},
      connectStudio: async () => {
        throw new Error("STUDIO_CONNECT_FAILED");
      }
    }),
    /STUDIO_CONNECT_FAILED/
  );
});

test("Missing connector fails closed", async () => {
  await assert.rejects(
    initializeShippingProfileDatabases({
      enabled: true,
      environment: "development",
      connectStore: async () => {}
    }),
    /SHIPPING_DATABASE_CONNECTOR_UNAVAILABLE/
  );
});

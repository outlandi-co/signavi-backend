import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldInitializeIsolatedDatabases
} from "./shouldInitializeIsolatedDatabases.js";

import {
  initializeShippingProfileDatabases
} from "./initializeShippingProfileDatabases.js";

test("development initializes when product isolation is enabled", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "development",
      productIsolation: "true",
      shippingProfileIsolation: "false"
    }),
    true
  );
});

test("development initializes when shipping isolation is enabled", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "development",
      productIsolation: "false",
      shippingProfileIsolation: "true"
    }),
    true
  );
});

test("development skips initialization when both flags are disabled", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "development",
      productIsolation: "false",
      shippingProfileIsolation: "false"
    }),
    false
  );
});

test("production always skips isolated initialization", () => {
  for (const productIsolation of ["true", "false"]) {
    for (const shippingProfileIsolation of ["true", "false"]) {
      assert.equal(
        shouldInitializeIsolatedDatabases({
          environment: "production",
          productIsolation,
          shippingProfileIsolation
        }),
        false
      );
    }
  }
});

test("production initializer does not invoke isolated connectors", async () => {
  let calls = 0;

  const result = await initializeShippingProfileDatabases({
    enabled: true,
    environment: "production",
    connectStore: async () => { calls++; },
    connectStudio: async () => { calls++; }
  });

  assert.equal(result, false);
  assert.equal(calls, 0);
});

test("development initializes Store before Studio", async () => {
  const order = [];

  const result = await initializeShippingProfileDatabases({
    enabled: true,
    environment: "development",
    connectStore: async () => order.push("store"),
    connectStudio: async () => order.push("studio")
  });

  assert.equal(result, true);
  assert.deepEqual(order, ["store", "studio"]);
});

test("failed Store connection prevents Studio initialization", async () => {
  let studioCalled = false;

  await assert.rejects(
    initializeShippingProfileDatabases({
      enabled: true,
      environment: "development",
      connectStore: async () => {
        throw new Error("STORE_CONNECTION_FAILED");
      },
      connectStudio: async () => {
        studioCalled = true;
      }
    }),
    /STORE_CONNECTION_FAILED/
  );

  assert.equal(studioCalled, false);
});

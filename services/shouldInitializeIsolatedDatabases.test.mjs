import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldInitializeIsolatedDatabases
} from "./shouldInitializeIsolatedDatabases.js";

const cases = [
  ["false", "false", false],
  ["true",  "false", true],
  ["false", "true",  true],
  ["true",  "true",  true]
];

for (const [productIsolation, shippingProfileIsolation, expected] of cases) {
  test(
    `Development: product=${productIsolation}, shipping=${shippingProfileIsolation}`,
    () => {
      assert.equal(
        shouldInitializeIsolatedDatabases({
          environment: "development",
          productIsolation,
          shippingProfileIsolation
        }),
        expected
      );
    }
  );
}

test("Production rejects product-only initialization", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "production",
      productIsolation: "true",
      shippingProfileIsolation: "false"
    }),
    false
  );
});

test("Production rejects shipping-only initialization", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "production",
      productIsolation: "false",
      shippingProfileIsolation: "true"
    }),
    false
  );
});

test("Production rejects both enabled", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "production",
      productIsolation: "true",
      shippingProfileIsolation: "true"
    }),
    false
  );
});

test("Boolean true cannot accidentally enable isolation", () => {
  assert.equal(
    shouldInitializeIsolatedDatabases({
      environment: "development",
      productIsolation: true,
      shippingProfileIsolation: false
    }),
    false
  );
});

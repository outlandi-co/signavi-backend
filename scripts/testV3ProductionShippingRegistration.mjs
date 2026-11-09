import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const server = fs.readFileSync(
  new URL("../server.js", import.meta.url),
  "utf8"
);

const registration = server.match(
  /if \(\s*process\.env\.ENABLE_V3_STOREFRONT_SHIPPING_QUOTES === "true"\s*\)\s*\{\s*app\.use\(\s*"\/api\/v3\/shipping",\s*createConfiguredV3StorefrontShippingQuoteRouter\(\)\s*\)\s*\}/
);

assert.ok(
  registration,
  "Shipping route must require its dedicated feature flag."
);

test("shipping registration remains disabled without explicit approval", () => {
  for (const environment of ["development", "production"]) {
    for (const flag of [undefined, "", "false", "TRUE", "1"]) {
      const registrations = [];

      vm.runInNewContext(registration[0], {
        process: {
          env: {
            NODE_ENV: environment,
            ENABLE_V3_STOREFRONT_SHIPPING_QUOTES: flag
          }
        },
        app: {
          use: (...args) => registrations.push(args)
        },
        createConfiguredV3StorefrontShippingQuoteRouter: () => ({})
      });

      assert.equal(registrations.length, 0);
    }
  }
});

test("explicit shipping flag registers exactly one route", () => {
  for (const environment of ["development", "production"]) {
    const registrations = [];
    const router = {};

    vm.runInNewContext(registration[0], {
      process: {
        env: {
          NODE_ENV: environment,
          ENABLE_V3_STOREFRONT_SHIPPING_QUOTES: "true"
        }
      },
      app: {
        use: (...args) => registrations.push(args)
      },
      createConfiguredV3StorefrontShippingQuoteRouter: () => router
    });

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0][0], "/api/v3/shipping");
    assert.equal(registrations[0][1], router);
  }
});

test("production checkout payment denial remains separate", () => {
  const checkout = fs.readFileSync(
    new URL("../routes/orders.js", import.meta.url),
    "utf8"
  );

  assert.match(checkout, /denyV3ProductionCheckout/);
  assert.match(checkout, /V3_CHECKOUT_NOT_ACTIVATED/);
  assert.match(checkout, /V3_SANDBOX_PREPARED_NO_PAYMENT/);
});
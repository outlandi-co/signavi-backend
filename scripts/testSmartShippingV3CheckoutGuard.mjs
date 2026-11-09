import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getSmartShippingCheckoutVersion
} from "../utils/smartShippingV3FeatureFlags.js";

const source = fs.readFileSync(
  new URL("../routes/orders.js", import.meta.url),
  "utf8"
);

const routeStart = source.indexOf('"/:id/checkout"');
const routeEnd = source.indexOf(
  "/* ================= SHIP ORDER",
  routeStart
);

assert.ok(routeStart >= 0, "Checkout route must exist");
assert.ok(routeEnd > routeStart, "Checkout route boundary must exist");

const checkout = source.slice(routeStart, routeEnd);

function position(marker) {
  const index = checkout.indexOf(marker);
  assert.ok(index >= 0, "Missing checkout marker: " + marker);
  return index;
}

const guard = position(
  'getSmartShippingCheckoutVersion() === "v3"'
);

const productionDeny = position(
  "denyV3ProductionCheckout()"
);

const productionReturn = position(
  "return res.status(gate.httpStatus).json(gate.body)"
);

const prepared = position(
  "const prepared = prepareV3CheckoutPayment({"
);

const sandboxPrepared = position(
  'code: "V3_SANDBOX_PREPARED_NO_PAYMENT"'
);

const locked = position(
  'code: "V3_CHECKOUT_NOT_ACTIVATED"'
);

const shipping = position(
  "applyCheckoutShipping(order, req.body || {})"
);

const save = position("await order.save()");

const square = position(
  "/api/square/create-payment/"
);

assert.ok(productionDeny > guard);
assert.ok(productionReturn > productionDeny);
assert.ok(prepared > productionReturn);
assert.ok(sandboxPrepared > prepared);
assert.ok(locked > sandboxPrepared);

for (const legacy of [shipping, save, square]) {
  assert.ok(legacy > locked, "V3 guards must precede legacy checkout");
}

assert.match(
  checkout,
  /return res\.status\(202\)\.json\(\{/
);

assert.match(
  checkout,
  /return res\.status\(423\)\.json\(\{/
);

assert.match(
  checkout,
  /verifyV3AppliedPayment\(order, prepared\)/
);

const v3Block = checkout.slice(guard, shipping);

assert.match(
  v3Block,
  /paymentCreated:\s*false/
);

assert.match(
  v3Block,
  /squareRequestAuthorized:\s*false/
);

assert.match(
  v3Block,
  /SQUARE_ENVIRONMENT/
);

console.log("V3 GUARD BEFORE LEGACY CHECKOUT: PASS");
console.log("PRODUCTION DENIAL BEFORE SANDBOX PREPARATION: PASS");
console.log("SANDBOX PREPARATION WITHOUT PAYMENT: PASS");
console.log("UNAUTHORIZED CHECKOUT LOCKED: PASS");

const previousFlag = process.env.SMART_SHIPPING_V3_ENABLED;
const previousNodeEnv = process.env.NODE_ENV;

try {
  delete process.env.SMART_SHIPPING_V3_ENABLED;
  process.env.NODE_ENV = "development";

  assert.equal(getSmartShippingCheckoutVersion(), "v2");
  console.log("DEFAULT V2 ROUTING: PASS");

  process.env.SMART_SHIPPING_V3_ENABLED = "true";
  process.env.NODE_ENV = "production";

  assert.equal(getSmartShippingCheckoutVersion(), "v2");
  console.log("PRODUCTION V2 ROUTING: PASS");
} finally {
  if (previousFlag === undefined) {
    delete process.env.SMART_SHIPPING_V3_ENABLED;
  } else {
    process.env.SMART_SHIPPING_V3_ENABLED = previousFlag;
  }

  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
}

console.log("ALL V3 CHECKOUT GUARD STRUCTURE TESTS PASSED");

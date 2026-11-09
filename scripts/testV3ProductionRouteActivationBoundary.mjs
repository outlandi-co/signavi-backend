import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(
  new URL(`../${relative}`, import.meta.url),
  "utf8"
);

const route = read("routes/orders.js");
const binding = read(
  "utils/createV3ProductionCheckoutActivation.js"
);
const coordinator = read(
  "utils/coordinateV3ProductionCheckoutActivation.js"
);
const history = read(
  "utils/checkV3KnownPaymentHistory.js"
);
const denial = read(
  "utils/denyV3ProductionCheckout.js"
);

test("production checkout route retains explicit denial", () => {
  assert.match(route, /denyV3ProductionCheckout\s*\(/);
  assert.match(
    denial,
    /V3_PRODUCTION_CHECKOUT_NOT_ACTIVATED/
  );
  assert.match(denial, /httpStatus:\s*423/);
});

test("production activation binding uses known history only", () => {
  assert.match(
    binding,
    /checkHistoricalPayment:\s*async/
  );
  assert.match(
    binding,
    /checkV3KnownPaymentHistory\s*\(/
  );
});

test("known MongoDB history cannot certify Square clearance", () => {
  assert.match(
    history,
    /verified:\s*false/
  );
  assert.match(
    history,
    /noPriorPaymentActivity:\s*false/
  );
  assert.match(
    history,
    /EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED/
  );
});

test("coordinator refuses unverified external payment history", () => {
  assert.match(
    coordinator,
    /history\?\.verified\s*!==\s*true/
  );
  assert.match(
    coordinator,
    /history\?\.noPriorPaymentActivity\s*!==\s*true/
  );
  assert.match(
    coordinator,
    /HISTORICAL_PAYMENT_NOT_CLEARED/
  );
});
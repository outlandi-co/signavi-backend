import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateV3CheckoutExecution
} from "../utils/v3CheckoutExecutionGate.js";

const requirements = {
  authenticated: true,
  authorizedOrder: true,
  verifiedQuote: true,
  paymentReady: true,
  historicalPaymentCleared: true,
  durableReservationVerified: true,
  reconciliationClear: true,
  productionClientVerified: true
};

test("all verified requirements permit execution review", () => {
  const result = evaluateV3CheckoutExecution(requirements);
  assert.equal(result.authorized, true);
  assert.equal(result.retryAuthorized, false);
});

test("missing authorization blocks checkout", () => {
  const result = evaluateV3CheckoutExecution({
    ...requirements,
    authorizedOrder: false
  });

  assert.equal(result.authorized, false);
});

test("uncertain reconciliation blocks checkout", () => {
  const result = evaluateV3CheckoutExecution({
    ...requirements,
    reconciliationClear: false
  });

  assert.equal(result.authorized, false);
});

test("missing requirements fail closed", () => {
  assert.equal(
    evaluateV3CheckoutExecution().authorized,
    false
  );
});
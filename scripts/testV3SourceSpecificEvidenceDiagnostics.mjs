import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3FirstPaymentEvidenceContract
} from "../utils/inspectV3FirstPaymentEvidenceContract.js";

const source = () => ({
  complete: true,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false
});

function snapshot() {
  return {
    knownHistory: {
      complete: true,
      knownRecordsClear: true
    },
    paymentLinks: source(),
    squareOrders: source(),
    squarePayments: source(),
    ownership: {
      complete: true,
      exclusive: false,
      durable: false
    }
  };
}

function assertLocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("each Square source reports its own positive observation", () => {
  const input = snapshot();

  input.paymentLinks.existingLink = true;
  input.squareOrders.existingOrder = true;
  input.squarePayments.existingPayment = true;

  const result = inspectV3FirstPaymentEvidenceContract(input);

  assert.deepEqual(
    result.sources.paymentLinks.observedPositiveSignals,
    ["existingLink"]
  );

  assert.deepEqual(
    result.sources.squareOrders.observedPositiveSignals,
    ["existingOrder"]
  );

  assert.deepEqual(
    result.sources.squarePayments.observedPositiveSignals,
    ["existingPayment"]
  );

  assert.ok(result.missingFieldCount > 0);
  assertLocked(result);
});

test("missing observations never become negative claims", () => {
  const result = inspectV3FirstPaymentEvidenceContract(
    snapshot()
  );

  for (const name of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.deepEqual(
      result.sources[name].observedPositiveSignals,
      []
    );
  }

  assert.equal(result.missingFieldCount, 18);
  assertLocked(result);
});

test("unrelated source fields cannot masquerade as evidence", () => {
  const input = snapshot();

  input.paymentLinks.existingPayment = true;
  input.squareOrders.existingLink = true;
  input.squarePayments.existingOrder = true;

  const result = inspectV3FirstPaymentEvidenceContract(input);

  for (const name of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.deepEqual(
      result.sources[name].observedPositiveSignals,
      []
    );
  }

  assertLocked(result);
});

test("missing reader remains unsafe and has no observations", () => {
  const input = snapshot();

  delete input.squareOrders;

  const result = inspectV3FirstPaymentEvidenceContract(input);

  assert.equal(result.sources.squareOrders.present, false);
  assert.equal(result.sources.squareOrders.unsafe, true);

  assert.deepEqual(
    result.sources.squareOrders.observedPositiveSignals,
    []
  );

  assertLocked(result);
});

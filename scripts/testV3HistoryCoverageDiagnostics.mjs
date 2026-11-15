import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3FirstPaymentEvidenceContract
} from "../utils/inspectV3FirstPaymentEvidenceContract.js";

const makeSource = (overrides = {}) => ({
  complete: false,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  ...overrides
});

const snapshot = overrides => ({
  knownHistory: {
    complete: true,
    knownRecordsClear: false
  },
  paymentLinks: makeSource(),
  squareOrders: makeSource(),
  squarePayments: makeSource(),
  ownership: {
    complete: true,
    exclusive: false,
    durable: false
  },
  ...overrides
});

function assertLocked(report) {
  assert.equal(report.readyForAuthorizationReview, false);
  assert.equal(report.authoritativeNoPriorActivity, false);
  assert.equal(report.initializationAuthorized, false);
  assert.equal(report.squareRequestAuthorized, false);
  assert.equal(report.retryAuthorized, false);
}

test("completed collection is not authoritative clearance", () => {
  const report = inspectV3FirstPaymentEvidenceContract(
    snapshot({
      squareOrders: makeSource({
        complete: true,
        reason: "COMPLETE"
      })
    })
  );

  assert.equal(
    report.sources.squareOrders.collectionStatus,
    "REPORTED_COMPLETE_NO_CLEARANCE"
  );

  assert.equal(report.sources.squareOrders.unsafe, true);
  assertLocked(report);
});

test("incomplete pagination retains its failure reason", () => {
  const report = inspectV3FirstPaymentEvidenceContract(
    snapshot({
      squarePayments: makeSource({
        complete: false,
        reason: "SQUARE_PAYMENT_CURSOR_INVALID"
      })
    })
  );

  assert.equal(
    report.sources.squarePayments.collectionStatus,
    "REPORTED_INCOMPLETE"
  );

  assert.equal(
    report.sources.squarePayments.reason,
    "SQUARE_PAYMENT_CURSOR_INVALID"
  );

  assertLocked(report);
});

test("observed prior activity remains visible after failure", () => {
  const report = inspectV3FirstPaymentEvidenceContract(
    snapshot({
      squarePayments: makeSource({
        complete: false,
        priorActivityFound: true,
        existingPayment: true,
        reason: "SQUARE_PAYMENT_READ_FAILED"
      })
    })
  );

  assert.equal(
    report.sources.squarePayments.collectionStatus,
    "PRIOR_ACTIVITY_OBSERVED"
  );

  assert.deepEqual(
    report.sources.squarePayments.observedPositiveSignals,
    ["existingPayment"]
  );

  assertLocked(report);
});

test("missing reader leaves coverage unknown", () => {
  const input = snapshot();
  delete input.squareOrders;

  const report = inspectV3FirstPaymentEvidenceContract(input);

  assert.equal(
    report.sources.squareOrders.collectionStatus,
    "UNKNOWN"
  );

  assert.equal(report.sources.squareOrders.unsafe, true);
  assertLocked(report);
});

test("new diagnostics do not fill the 18 missing fields", () => {
  const report = inspectV3FirstPaymentEvidenceContract(
    snapshot()
  );

  assert.equal(report.missingFieldCount, 18);
  assert.equal(report.unsafeSourceCount, 5);
  assertLocked(report);
});

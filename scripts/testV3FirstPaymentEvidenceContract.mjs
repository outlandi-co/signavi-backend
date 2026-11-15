import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3FirstPaymentEvidenceContract
} from "../utils/inspectV3FirstPaymentEvidenceContract.js";

const squareRecord = () => ({
  complete: true,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false
});

const evidence = () => ({
  knownHistory: {
    complete: true,
    knownRecordsClear: true,
    authoritativeNoPriorActivity: false
  },
  paymentLinks: squareRecord(),
  squareOrders: squareRecord(),
  squarePayments: squareRecord(),
  ownership: {
    complete: true,
    exclusive: false,
    durable: false,
    authoritativeNoPriorActivity: false
  }
});

test("actual reader shapes expose all 18 missing booleans", () => {
  const report = inspectV3FirstPaymentEvidenceContract(
    evidence()
  );

  assert.equal(report.missingFieldCount, 18);

  for (const source of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.deepEqual(
      report.sources[source].missingFields,
      [
        "hasMore",
        "timedOut",
        "existingPayment",
        "existingLink",
        "conflicting",
        "identityMismatch"
      ]
    );
  }

  assert.equal(report.unsafeSourceCount, 4);
  assert.equal(report.squareRequestAuthorized, false);
});

test("missing readers remain unknown and unsafe", () => {
  const report =
    inspectV3FirstPaymentEvidenceContract({});

  assert.equal(report.unsafeSourceCount, 5);
  assert.equal(report.sources.ownership.present, false);
  assert.equal(report.squareRequestAuthorized, false);
});

test("unexpected positive authority is detected but never propagated", () => {
  const input = evidence();

  input.paymentLinks.squareRequestAuthorized = true;

  const report =
    inspectV3FirstPaymentEvidenceContract(input);

  assert.deepEqual(
    report.sources.paymentLinks.raisedAuthority,
    ["squareRequestAuthorized"]
  );

  assert.equal(report.squareRequestAuthorized, false);
  assert.equal(report.initializationAuthorized, false);
});

test("even fully populated supplied evidence is diagnostic only", () => {
  const input = evidence();

  for (const source of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    Object.assign(input[source], {
      hasMore: false,
      timedOut: false,
      existingPayment: false,
      existingLink: false,
      conflicting: false,
      identityMismatch: false
    });
  }

  input.ownership.exclusive = true;
  input.ownership.durable = true;

  const report =
    inspectV3FirstPaymentEvidenceContract(input);

  assert.equal(report.missingFieldCount, 0);
  assert.equal(report.unsafeSourceCount, 0);

  // Supplied booleans alone never prove their provenance.
  assert.equal(report.readyForAuthorizationReview, false);
  assert.equal(report.squareRequestAuthorized, false);
  assert.equal(report.retryAuthorized, false);
});
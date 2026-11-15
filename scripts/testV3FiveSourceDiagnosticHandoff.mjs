import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

const orderId = "507f1f77bcf86cd799439011";

function evidence(overrides = {}) {
  return {
    orderId,
    environment: "sandbox",
    complete: true,
    hasMore: false,
    timedOut: false,
    priorActivityFound: false,
    existingPayment: false,
    existingLink: false,
    conflicting: false,
    identityMismatch: false,
    authoritativeNoPriorActivity: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    ...overrides
  };
}

function createService({
  overrides = {},
  calls = {}
} = {}) {
  const readers = {
    readKnownHistory: async () =>
      evidence({ knownRecordsClear: true }),

    readOwnership: async () =>
      evidence({ exclusive: true, durable: true }),

    readPaymentLinks: async () => evidence(),
    readSquareOrders: async () => evidence(),
    readSquarePayments: async () => evidence(),

    ...overrides
  };

  for (const [name, original] of Object.entries(readers)) {
    readers[name] = async (...args) => {
      calls[name] = (calls[name] ?? 0) + 1;
      return original(...args);
    };
  }

  return createV3ServerBoundFirstPaymentReview(readers);
}

function assertLocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);

  const five = result.fiveSourceDiagnostics;

  assert.equal(five.unresolvedSourceCount, 5);
  assert.equal(five.authoritativeNoPriorActivity, false);
  assert.equal(five.initializationAuthorized, false);
  assert.equal(five.squareRequestAuthorized, false);
  assert.equal(five.retryAuthorized, false);

  for (const name of [
    "knownHistory",
    "ownership",
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.equal(
      five[name].trustedForReconciliation,
      false,
      name
    );

    assert.equal(
      five[name].safeForAuthorization,
      false,
      name
    );
  }
}

test("five readers execute once in one diagnostic review", async () => {
  const calls = {};
  const service = createService({ calls });

  const result = await service.reviewWithDiagnostics(orderId);

  for (const name of [
    "readKnownHistory",
    "readOwnership",
    "readPaymentLinks",
    "readSquareOrders",
    "readSquarePayments"
  ]) {
    assert.equal(calls[name], 1, name);
  }

  assert.equal(
    result.fiveSourceDiagnostics.knownHistory.reportedKnownRecordsClear,
    true
  );

  assert.equal(
    result.fiveSourceDiagnostics.ownership.reportedExclusive,
    true
  );

  assert.equal(
    result.fiveSourceDiagnostics.ownership.reportedDurable,
    true
  );

  assertLocked(result);
});

test("original strict review remains unchanged", async () => {
  const service = createService();

  const existing = await service.review(orderId);
  const diagnostic = await service.reviewWithDiagnostics(orderId);

  assert.deepEqual(diagnostic.review, existing);
  assert.equal(service.createPayment, undefined);
  assert.equal(service.authorizePayment, undefined);

  assertLocked(diagnostic);
});

test("forged local clearance cannot authorize payment", async () => {
  const service = createService({
    overrides: {
      readKnownHistory: async () =>
        evidence({
          knownRecordsClear: true,
          authoritativeNoPriorActivity: true
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.fiveSourceDiagnostics.knownHistory.provenanceVerified,
    false
  );

  assertLocked(result);
});

test("mismatched ownership remains unverified", async () => {
  const service = createService({
    overrides: {
      readOwnership: async () =>
        evidence({
          orderId: "b".repeat(24),
          exclusive: true,
          durable: true
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.fiveSourceDiagnostics.ownership.identityMatched,
    false
  );

  assert.equal(
    result.fiveSourceDiagnostics.ownership.observation,
    "UNVERIFIED"
  );

  assert.equal(result.review.readyForAuthorizationReview, false);
  assertLocked(result);
});

test("failed local reader cannot become trusted evidence", async () => {
  const service = createService({
    overrides: {
      readKnownHistory: async () => {
        throw new Error("SIMULATED_LOCAL_HISTORY_FAILURE");
      }
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.fiveSourceDiagnostics.knownHistory.observation,
    "UNVERIFIED"
  );

  assert.equal(result.review.readyForAuthorizationReview, false);
  assertLocked(result);
});

test("invalid ID does not execute any reader", async () => {
  const calls = {};
  const service = createService({ calls });

  const result = await service.reviewWithDiagnostics("invalid");

  assert.equal(result.review.reason, "INVALID_ORDER_ID");
  assert.deepEqual(calls, {});

  assertLocked(result);
});

test("Square source diagnostics are reused", async () => {
  const service = createService();

  const result = await service.reviewWithDiagnostics(orderId);

  for (const name of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.strictEqual(
      result.fiveSourceDiagnostics[name],
      result.diagnostics.sources[name]
    );
  }

  assertLocked(result);
});

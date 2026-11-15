import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3FiveSourceConsistency
} from "../utils/assessV3FiveSourceConsistency.js";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

const orderId = "507f1f77bcf86cd799439011";

const evidence = (extra = {}) => ({
  orderId,
  environment: "sandbox",
  complete: true,
  hasMore: false,
  timedOut: false,
  priorActivityFound: false,
  existingLink: false,
  existingPayment: false,
  conflicting: false,
  identityMismatch: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  ...extra
});

function serviceWith({
  calls = {},
  overrides = {}
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

  for (const [name, fn] of Object.entries(readers)) {
    readers[name] = async (...args) => {
      calls[name] = (calls[name] ?? 0) + 1;
      return fn(...args);
    };
  }

  return createV3ServerBoundFirstPaymentReview(readers);
}

function assertLocked(result) {
  const reconciliation = result.crossSourceReconciliation;

  assert.equal(reconciliation.ready, false);
  assert.equal(reconciliation.provenanceVerified, false);
  assert.equal(
    reconciliation.authoritativeNoPriorActivity,
    false
  );
  assert.equal(
    reconciliation.readyForAuthorizationReview,
    false
  );
  assert.equal(
    reconciliation.initializationAuthorized,
    false
  );
  assert.equal(
    reconciliation.squareRequestAuthorized,
    false
  );
  assert.equal(reconciliation.retryAuthorized, false);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("five clear reports do not establish trusted absence", async () => {
  const service = serviceWith();

  const result = await service.reviewWithDiagnostics(orderId);
  const assessment = result.crossSourceReconciliation;

  assert.deepEqual(
    assessment.reportedSquareActivitySources,
    []
  );

  assert.deepEqual(
    assessment.missingOrUnverifiedSources,
    []
  );

  assert.equal(
    assessment.issues.includes(
      "TRUSTED_RECONCILIATION_NOT_ESTABLISHED"
    ),
    true
  );

  assert.equal(assessment.sourceCount, 5);
  assertLocked(result);
});

test("local clear report versus Square activity is flagged", async () => {
  const service = serviceWith({
    overrides: {
      readSquarePayments: async () =>
        evidence({
          existingPayment: true,
          priorActivityFound: true
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);
  const assessment = result.crossSourceReconciliation;

  assert.equal(
    assessment.localClearSquareActivityDisagreement,
    true
  );

  assert.deepEqual(
    assessment.reportedSquareActivitySources,
    ["squarePayments"]
  );

  assert.equal(
    assessment.issues.includes(
      "LOCAL_CLEAR_VS_SQUARE_ACTIVITY_REPORTED"
    ),
    true
  );

  assertLocked(result);
});

test("missing source identity is reported", async () => {
  const service = serviceWith({
    overrides: {
      readOwnership: async () =>
        evidence({
          orderId: "a".repeat(24),
          exclusive: true,
          durable: true
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.crossSourceReconciliation
      .missingOrUnverifiedSources
      .includes("ownership"),
    true
  );

  assertLocked(result);
});

test("unsupported ownership assurance is flagged", async () => {
  const service = serviceWith({
    overrides: {
      readOwnership: async () =>
        evidence({
          exclusive: false,
          durable: false
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.crossSourceReconciliation.issues.includes(
      "OWNERSHIP_ASSURANCES_NOT_REPORTED"
    ),
    true
  );

  assertLocked(result);
});

test("missing local clearance is not silently accepted", async () => {
  const service = serviceWith({
    overrides: {
      readKnownHistory: async () =>
        evidence({ knownRecordsClear: false })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.crossSourceReconciliation.issues.includes(
      "LOCAL_HISTORY_CLEARANCE_NOT_REPORTED"
    ),
    true
  );

  assertLocked(result);
});

test("reader failures remain unresolved", async () => {
  const service = serviceWith({
    overrides: {
      readSquareOrders: async () => {
        throw new Error("SIMULATED_FAILURE");
      }
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.crossSourceReconciliation
      .missingOrUnverifiedSources
      .includes("squareOrders"),
    true
  );

  assertLocked(result);
});

test("reconciliation does not execute readers twice", async () => {
  const calls = {};
  const service = serviceWith({ calls });

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

  assertLocked(result);
});

test("invalid order identity cannot invoke readers", async () => {
  const calls = {};
  const service = serviceWith({ calls });

  const result = await service.reviewWithDiagnostics("invalid");

  assert.deepEqual(calls, {});
  assert.equal(result.review.reason, "INVALID_ORDER_ID");
  assertLocked(result);
});

test("the pure consistency assessor fails closed", () => {
  const result = assessV3FiveSourceConsistency(null);

  assert.equal(result.ready, false);
  assert.equal(result.missingOrUnverifiedSources.length, 5);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.issues), true);
  assert.equal(result.squareRequestAuthorized, false);
});

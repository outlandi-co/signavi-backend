import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

const orderId = "507f1f77bcf86cd799439011";

function evidence(fields = {}) {
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
    ...fields
  };
}

function configure({
  calls = {},
  overrides = {}
} = {}) {
  const readers = {
    readKnownHistory: async () =>
      evidence({ knownRecordsClear: true }),

    readPaymentLinks: async () => evidence(),

    readSquareOrders: async () => evidence(),

    readSquarePayments: async () => evidence(),

    readOwnership: async () =>
      evidence({ exclusive: true, durable: true }),

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
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);

  assert.equal(result.diagnostics.squareRequestAuthorized, false);
  assert.equal(result.diagnostics.retryAuthorized, false);

  for (const source of Object.values(result.diagnostics.sources)) {
    assert.equal(source.provenanceVerified, false);
    assert.equal(source.trustedForReconciliation, false);
    assert.equal(source.safeForAuthorization, false);
    assert.equal(source.authoritativeAbsenceEstablished, false);
  }
}

test("existing review result is preserved", async () => {
  const service = configure();

  const original = await service.review(orderId);
  const combined = await service.reviewWithDiagnostics(orderId);

  assert.deepEqual(combined.review, original);
  assertLocked(combined);

  assert.equal(service.createPayment, undefined);
  assert.equal(service.authorizePayment, undefined);
  assert.equal(Object.isFrozen(service), true);
});

test("five readers run once per diagnostic review", async () => {
  const calls = {};
  const service = configure({ calls });

  const result = await service.reviewWithDiagnostics(orderId);

  for (const name of [
    "readKnownHistory",
    "readPaymentLinks",
    "readSquareOrders",
    "readSquarePayments",
    "readOwnership"
  ]) {
    assert.equal(calls[name], 1, name);
  }

  for (const name of [
    "paymentLinks",
    "squareOrders",
    "squarePayments"
  ]) {
    assert.equal(
      result.diagnostics.sources[name].observation,
      "REPORTED_COMPLETE_NO_CLEARANCE"
    );
  }

  assertLocked(result);
});

test("positive Square activity remains diagnostic only", async () => {
  const service = configure({
    overrides: {
      readSquarePayments: async () =>
        evidence({
          priorActivityFound: true,
          existingPayment: true
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.diagnostics.sources.squarePayments.observation,
    "PRIOR_ACTIVITY_OBSERVED"
  );

  assert.equal(
    result.diagnostics.sources.squarePayments.positiveObserved,
    true
  );

  assertLocked(result);
});

test("reader failure cannot produce trusted provenance", async () => {
  const service = configure({
    overrides: {
      readSquareOrders: async () => {
        throw new Error("SIMULATED_READER_FAILURE");
      }
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.review.readyForAuthorizationReview,
    false
  );

  assert.equal(
    result.diagnostics.sources.squareOrders.observation,
    "UNVERIFIED"
  );

  assertLocked(result);
});

test("invalid order ID never invokes readers", async () => {
  const calls = {};
  const service = configure({ calls });

  const result = await service.reviewWithDiagnostics("invalid");

  assert.equal(result.review.reason, "INVALID_ORDER_ID");
  assert.deepEqual(calls, {});
  assertLocked(result);
});

test("caller cannot replace configured readers", async () => {
  let injectedCalls = 0;

  const service = configure();

  const result = await service.reviewWithDiagnostics(
    orderId,
    {
      readSquarePayments: async () => {
        injectedCalls++;
        return evidence({
          priorActivityFound: true
        });
      }
    }
  );

  assert.equal(injectedCalls, 0);
  assertLocked(result);
});

test("forged source authority remains untrusted", async () => {
  const service = configure({
    overrides: {
      readSquareOrders: async () =>
        evidence({
          provenanceVerified: true,
          trustedForReconciliation: true,
          authoritativeNoPriorActivity: true,
          squareRequestAuthorized: true
        })
    }
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(
    result.review.readyForAuthorizationReview,
    false
  );

  assertLocked(result);
});


test("forged authority fields always block the nested review", async () => {
  const forbidden = [
    "authoritativeNoPriorActivity",
    "initializationAuthorized",
    "squareRequestAuthorized",
    "retryAuthorized",
    "provenanceVerified",
    "trustedForReconciliation",
    "safeForAuthorization"
  ];

  for (const field of forbidden) {
    const service = configure({
      overrides: {
        readSquareOrders: async () =>
          evidence({ [field]: true })
      }
    });

    const result = await service.reviewWithDiagnostics(orderId);

    assert.equal(
      result.review.readyForAuthorizationReview,
      false,
      field
    );

    assert.equal(
      result.review.reason,
      "UNTRUSTED_SOURCE_AUTHORITY_CLAIM",
      field
    );

    assertLocked(result);
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SourceScopedEvidence
} from "../utils/inspectV3SourceScopedEvidence.js";

const orderId = "a".repeat(24);

const makeEvidence = (overrides = {}) => ({
  orderId,
  environment: "sandbox",
  complete: true,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  ...overrides
});

const inspect = snapshot =>
  inspectV3SourceScopedEvidence({ orderId, snapshot });

function assertNotTrusted(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);

  for (const source of Object.values(result.sources)) {
    assert.equal(source.provenanceVerified, false);
    assert.equal(source.trustedForReconciliation, false);
    assert.equal(source.safeForAuthorization, false);
    assert.equal(source.authoritativeAbsenceEstablished, false);
  }
}

test("matching identity fields do not establish provenance", () => {
  const result = inspect({
    paymentLinks: makeEvidence(),
    squareOrders: makeEvidence(),
    squarePayments: makeEvidence()
  });

  assert.equal(result.sources.squareOrders.identityMatched, true);
  assert.equal(result.sources.squarePayments.identityMatched, true);
  assertNotTrusted(result);
});

test("forged caller provenance flags cannot be promoted", () => {
  const forged = makeEvidence({
    provenanceVerified: true,
    trustedForReconciliation: true,
    authoritativeNoPriorActivity: true,
    squareRequestAuthorized: true,
    retryAuthorized: true
  });

  const result = inspect({
    paymentLinks: forged,
    squareOrders: forged,
    squarePayments: forged
  });

  assertNotTrusted(result);
});

test("forged completed empty history is not proof of absence", () => {
  const result = inspect({
    paymentLinks: makeEvidence(),
    squareOrders: makeEvidence(),
    squarePayments: makeEvidence()
  });

  for (const source of Object.values(result.sources)) {
    assert.equal(
      source.observation,
      "REPORTED_COMPLETE_NO_CLEARANCE"
    );
  }

  assertNotTrusted(result);
});

test("reported prior activity remains diagnostic only", () => {
  const result = inspect({
    paymentLinks: makeEvidence(),
    squareOrders: makeEvidence({
      priorActivityFound: true,
      existingOrder: true
    }),
    squarePayments: makeEvidence()
  });

  assert.equal(
    result.sources.squareOrders.observation,
    "PRIOR_ACTIVITY_OBSERVED"
  );

  assert.equal(
    result.sources.squareOrders.positiveObserved,
    true
  );

  assertNotTrusted(result);
});

test("mismatched identity cannot become trusted evidence", () => {
  const result = inspect({
    paymentLinks: makeEvidence(),
    squareOrders: makeEvidence({
      orderId: "b".repeat(24),
      provenanceVerified: true
    }),
    squarePayments: makeEvidence()
  });

  assert.equal(
    result.sources.squareOrders.identityMatched,
    false
  );

  assert.equal(
    result.sources.squareOrders.observation,
    "UNVERIFIED"
  );

  assertNotTrusted(result);
});

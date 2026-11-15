import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SourceScopedEvidence
} from "../utils/inspectV3SourceScopedEvidence.js";

import {
  inspectV3FirstPaymentEvidenceContract
} from "../utils/inspectV3FirstPaymentEvidenceContract.js";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

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

function assertLocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("actual empty collectors remain non-authorizing", async () => {
  const orders = await collectV3SandboxOrderRecordEvidence({
    orderId,
    listPage: async () => ({ orders: [], cursor: null })
  });

  const payments = await collectV3SandboxPaymentRecordEvidence({
    orderId,
    listPage: async () => ({ payments: [], cursor: null })
  });

  const result = inspectV3SourceScopedEvidence({
    orderId,
    snapshot: {
      paymentLinks: makeEvidence(),
      squareOrders: orders,
      squarePayments: payments
    }
  });

  assert.equal(result.observedActivityCount, 0);
  assert.equal(result.unresolvedSourceCount, 3);

  for (const source of Object.values(result.sources)) {
    assert.equal(
      source.observation,
      "REPORTED_COMPLETE_NO_CLEARANCE"
    );
    assert.equal(source.authoritativeAbsenceEstablished, false);
    assert.equal(source.safeForAuthorization, false);
  }

  assertLocked(result);
});

test("each source recognizes only its own positive field", () => {
  const result = inspectV3SourceScopedEvidence({
    orderId,
    snapshot: {
      paymentLinks: makeEvidence({
        priorActivityFound: true,
        existingLink: true
      }),
      squareOrders: makeEvidence({
        priorActivityFound: true,
        existingOrder: true
      }),
      squarePayments: makeEvidence({
        priorActivityFound: true,
        existingPayment: true
      })
    }
  });

  assert.equal(result.observedActivityCount, 3);

  assert.equal(
    result.sources.paymentLinks.positiveField,
    "existingLink"
  );

  assert.equal(
    result.sources.squareOrders.positiveField,
    "existingOrder"
  );

  assert.equal(
    result.sources.squarePayments.positiveField,
    "existingPayment"
  );

  assertLocked(result);
});

test("identity mismatch cannot be treated as trusted evidence", () => {
  const result = inspectV3SourceScopedEvidence({
    orderId,
    snapshot: {
      paymentLinks: makeEvidence({
        orderId: "b".repeat(24)
      }),
      squareOrders: makeEvidence(),
      squarePayments: makeEvidence()
    }
  });

  assert.equal(result.sources.paymentLinks.identityMatched, false);
  assert.equal(result.sources.paymentLinks.observation, "UNVERIFIED");
  assertLocked(result);
});

test("incomplete history remains unresolved", () => {
  const result = inspectV3SourceScopedEvidence({
    orderId,
    snapshot: {
      paymentLinks: makeEvidence(),
      squareOrders: makeEvidence({
        complete: false,
        reason: "SQUARE_ORDER_CURSOR_INVALID"
      }),
      squarePayments: makeEvidence()
    }
  });

  assert.equal(
    result.sources.squareOrders.observation,
    "REPORTED_INCOMPLETE"
  );

  assert.equal(
    result.sources.squareOrders.reason,
    "SQUARE_ORDER_CURSOR_INVALID"
  );

  assertLocked(result);
});

test("contradictory positive observation remains unverified", () => {
  const result = inspectV3SourceScopedEvidence({
    orderId,
    snapshot: {
      paymentLinks: makeEvidence(),
      squareOrders: makeEvidence({
        priorActivityFound: false,
        existingOrder: true
      }),
      squarePayments: makeEvidence()
    }
  });

  assert.equal(result.sources.squareOrders.contradictory, true);
  assert.equal(result.sources.squareOrders.observation, "UNVERIFIED");
  assert.equal(result.sources.squareOrders.positiveObserved, true);
  assertLocked(result);
});

test("legacy strict contract remains independent and locked", () => {
  const snapshot = {
    knownHistory: {
      complete: true,
      knownRecordsClear: false
    },
    paymentLinks: makeEvidence(),
    squareOrders: makeEvidence(),
    squarePayments: makeEvidence(),
    ownership: {
      complete: true,
      exclusive: false,
      durable: false
    }
  };

  const scoped = inspectV3SourceScopedEvidence({
    orderId,
    snapshot
  });

  const strict = inspectV3FirstPaymentEvidenceContract(snapshot);

  assert.equal(strict.missingFieldCount, 18);
  assert.equal(strict.unsafeSourceCount, 5);
  assertLocked(scoped);
  assertLocked(strict);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerOwnedFiveSourceDiagnosticReview,
  createV3UnresolvedSquareEvidenceReaders
} from "../utils/createV3ServerOwnedFiveSourceDiagnosticReview.js";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

const orderId = "507f1f77bcf86cd799439011";

test("all three Square sources report unresolved evidence", async () => {
  const readers = createV3UnresolvedSquareEvidenceReaders();

  assert.equal(Object.isFrozen(readers), true);

  for (const name of [
    "readPaymentLinks",
    "readSquareOrders",
    "readSquarePayments"
  ]) {
    const evidence = await readers[name]({ orderId });

    assert.equal(evidence.orderId, orderId);
    assert.equal(evidence.complete, false);
    assert.equal(evidence.provenanceVerified, false);
    assert.equal(evidence.trustedForReconciliation, false);
    assert.equal(evidence.authoritativeNoPriorActivity, false);
    assert.equal(evidence.squareRequestAuthorized, false);
    assert.equal(evidence.retryAuthorized, false);
    assert.equal(
      evidence.reason,
      "V3_SQUARE_SOURCE_PROVENANCE_NOT_CONNECTED"
    );
    assert.equal(Object.isFrozen(evidence), true);
  }
});

test("unresolved Square readers cannot create review authority", async () => {
  const local = {
    async readKnownHistory() {
      return {
        orderId,
        environment: "sandbox",
        complete: true,
        knownRecordsClear: true
      };
    },

    async readOwnership() {
      return {
        orderId,
        environment: "sandbox",
        complete: true,
        exclusive: true,
        durable: true
      };
    }
  };

  const service = createV3ServerBoundFirstPaymentReview({
    ...local,
    ...createV3UnresolvedSquareEvidenceReaders()
  });

  const result = await service.reviewWithDiagnostics(orderId);

  assert.equal(result.review.readyForAuthorizationReview, false);
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(
    result.crossSourceReconciliation.squareRequestAuthorized,
    false
  );
});

test("unresolved Square readers remain incomplete even with fake local clearance", async () => {
  const readers = createV3UnresolvedSquareEvidenceReaders();

  for (const name of Object.keys(readers)) {
    const report = await readers[name]({ orderId });

    assert.equal(report.complete, false);
    assert.equal(report.safeForAuthorization, false);
    assert.equal(report.authoritativeAbsenceEstablished, false);
  }
});

test("production cannot construct the server-owned diagnostic service", async () => {
  const savedNode = process.env.NODE_ENV;
  const savedSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    await assert.rejects(
      createV3ServerOwnedFiveSourceDiagnosticReview(),
      { message: "V3_SANDBOX_LOCAL_REVIEW_REQUIRED" }
    );
  } finally {
    if (savedNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNode;

    if (savedSquare === undefined)
      delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = savedSquare;
  }
});

test("diagnostic service exposes no payment execution API", () => {
  assert.equal(
    createV3ServerOwnedFiveSourceDiagnosticReview.length,
    0
  );

  const readers = createV3UnresolvedSquareEvidenceReaders();

  assert.deepEqual(
    Object.keys(readers).sort(),
    [
      "readPaymentLinks",
      "readSquareOrders",
      "readSquarePayments"
    ].sort()
  );

  assert.equal(readers.createPaymentLink, undefined);
  assert.equal(readers.initializePayment, undefined);
  assert.equal(readers.retryPayment, undefined);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyV3ExpiredRecoveryEvidence
} from "../utils/verifyV3ExpiredRecoveryEvidence.js";

const id = "507f1f77bcf86cd799439011";
const owner = "test-lock-owner";
const now = new Date("2026-11-03T12:00:00.000Z");

function fixture() {
  return {
    orderId: id,
    owner,
    now,
    lock: {
      _id: id,
      owner,
      expiresAt: new Date("2026-11-03T11:58:00.000Z")
    },
    order: {
      _id: id,
      status: "payment_required",
      paymentStatus: "unpaid",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 3355
    },
    operation: {
      orderId: id,
      environment: "sandbox",
      status: "pending",
      requestOwner: "",
      amountCents: 3355,
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      squareDiagnostic: null,
      lastError: ""
    }
  };
}

test("pristine expired sandbox checkout is eligible", () => {
  const result = verifyV3ExpiredRecoveryEvidence(fixture());

  assert.equal(result.eligible, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

const scenarios = [
  ["active lock", x => {
    x.lock.expiresAt = new Date("2026-11-03T12:01:00Z");
  }],
  ["wrong owner", x => { x.lock.owner = "different-owner"; }],
  ["missing order", x => { x.order = null; }],
  ["paid order", x => { x.order.paymentStatus = "paid"; }],
  ["wrong environment", x => { x.order.squareEnvironment = "production"; }],
  ["amount mismatch", x => { x.operation.amountCents = 3356; }],
  ["started operation", x => { x.operation.status = "reconciliation_required"; }],
  ["operation owner", x => { x.operation.requestOwner = "started-owner"; }],
  ["creation claim", x => {
    x.operation.squareCreationAttemptClaimedAt = now;
  }],
  ["Square idempotency key", x => {
    x.operation.squareIdempotencyKey = "already-claimed";
  }],
  ["Square payment link", x => {
    x.operation.squarePaymentLinkId = "square-link";
  }],
  ["Square diagnostic", x => {
    x.operation.squareDiagnostic = { type: "timeout" };
  }],
  ["uncertain error", x => {
    x.operation.lastError = "External outcome unknown";
  }],
  ["order payment evidence", x => {
    x.order.squarePaymentId = "existing-payment";
  }]
];

for (const [name, mutate] of scenarios) {
  test(`${name} blocks recovery`, () => {
    const input = fixture();
    mutate(input);

    const result = verifyV3ExpiredRecoveryEvidence(input);

    assert.equal(result.eligible, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });
}
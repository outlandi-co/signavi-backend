import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyV3PendingOperationResume
} from "../utils/verifyV3PendingOperationResume.js";

const id = "507f1f77bcf86cd799439011";
const now = new Date("2026-11-03T12:00:00.000Z");

function fixture() {
  return {
    orderId: id,
    now,
    lock: {
      orderId: id,
      owner: "new-trusted-owner",
      expiresAt: new Date("2026-11-03T12:02:00Z")
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
      idempotencyKey: `signavi-v3-sandbox-${id}`,
      checkoutReferenceId: `checkout-${id}`,
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

test("pristine pending identity is reusable without execution authorization", () => {
  const input = fixture();
  const result = verifyV3PendingOperationResume(input);

  assert.equal(result.eligible, true);
  assert.equal(result.idempotencyKey, input.operation.idempotencyKey);
  assert.equal(result.amountCents, 3355);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

const scenarios = [
  ["expired new lock", x => { x.lock.expiresAt = now; }],
  ["missing lock", x => { x.lock = null; }],
  ["wrong lock order", x => { x.lock.orderId = "507f1f77bcf86cd799439012"; }],
  ["missing order", x => { x.order = null; }],
  ["paid order", x => { x.order.paymentStatus = "paid"; }],
  ["production order", x => { x.order.squareEnvironment = "production"; }],
  ["existing payment", x => { x.order.squarePaymentId = "payment"; }],
  ["changed amount", x => { x.operation.amountCents = 3356; }],
  ["started operation", x => { x.operation.status = "reconciliation_required"; }],
  ["existing owner", x => { x.operation.requestOwner = "old-owner"; }],
  ["wrong idempotency identity", x => { x.operation.idempotencyKey = "invalid"; }],
  ["missing checkout reference", x => { x.operation.checkoutReferenceId = ""; }],
  ["creation attempt claimed", x => { x.operation.squareCreationAttemptClaimedAt = now; }],
  ["Square request key", x => { x.operation.squareIdempotencyKey = "existing-key"; }],
  ["Square link", x => { x.operation.squarePaymentLinkId = "existing-link"; }],
  ["uncertain diagnostic", x => { x.operation.squareDiagnostic = {type:"timeout"}; }],
  ["uncertain error", x => { x.operation.lastError = "unknown"; }]
];

for (const [name, mutate] of scenarios) {
  test(`${name} blocks resume`, () => {
    const input = fixture();
    mutate(input);
    const result = verifyV3PendingOperationResume(input);
    assert.equal(result.eligible, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });
}
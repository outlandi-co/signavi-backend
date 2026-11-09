import test from "node:test";
import assert from "node:assert/strict";
import {
  assessV3SandboxInitialization as assess
} from "../utils/assessV3SandboxInitialization.js";

const id = "507f1f77bcf86cd799439011";

function evidence() {
  return {
    storefrontOrder: {
      _id: id,
      source: "store",
      currency: "USD",
      status: "payment_required",
      paymentStatus: "unpaid",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 4722
    },
    storefrontOperation: {
      orderId: id,
      status: "pending",
      environment: "sandbox",
      requestOwner: "",
      amountCents: 4722,
      idempotencyKey: "signavi-v3-sandbox-existing",
      checkoutReferenceId: "existing-reference"
    },
    sandboxOrder: null,
    sandboxOperation: null
  };
}

test("pristine records qualify only as candidate", () => {
  const result = assess(evidence());
  assert.equal(result.eligible, true);
  assert.equal(result.amountCents, 4722);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal("paymentUrl" in result, false);
});

test("existing sandbox operation blocks initialization", () => {
  const input = evidence();
  input.sandboxOperation = { orderId: id };
  assert.equal(
    assess(input).reason,
    "SANDBOX_RECORD_ALREADY_EXISTS"
  );
});

test("existing sandbox order blocks initialization", () => {
  const input = evidence();
  input.sandboxOrder = { _id: id };
  assert.equal(
    assess(input).reason,
    "SANDBOX_RECORD_ALREADY_EXISTS"
  );
});

test("changed amount blocks initialization", () => {
  const input = evidence();
  input.storefrontOperation.amountCents = 5000;
  assert.equal(assess(input).eligible, false);
});

test("claimed Square creation blocks initialization", () => {
  const input = evidence();
  input.storefrontOperation.squareCreationAttemptClaimedAt =
    new Date();
  assert.equal(
    assess(input).reason,
    "PAYMENT_CREATION_EVIDENCE_PRESENT"
  );
});

test("existing storefront payment blocks initialization", () => {
  const input = evidence();
  input.storefrontOrder.squarePaymentLinkId = "square-link";
  assert.equal(
    assess(input).reason,
    "STOREFRONT_PAYMENT_EVIDENCE_PRESENT"
  );
});

test("paid orders cannot initialize", () => {
  const input = evidence();
  input.storefrontOrder.paymentStatus = "paid";
  assert.equal(assess(input).eligible, false);
});

test("production orders cannot initialize", () => {
  const input = evidence();
  input.storefrontOrder.squareEnvironment = "production";
  assert.equal(assess(input).eligible, false);
});

test("missing order cannot initialize", () => {
  const input = evidence();
  input.storefrontOrder = null;
  assert.equal(assess(input).eligible, false);
});
import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxInitializationReadiness as assess
} from "../utils/assessV3SandboxInitializationReadiness.js";

const id = "507f1f77bcf86cd799439011";

function validInput() {
  return {
    storefrontDatabase: "signavi_store",
    sandboxDatabase: "signavi_shipping_v3_dev",
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
      environment: "sandbox",
      status: "pending",
      requestOwner: "",
      amountCents: 4722,
      idempotencyKey: "signavi-v3-sandbox-existing",
      checkoutReferenceId: "existing-reference"
    },
    sandboxOrder: null,
    sandboxOperation: null,
    guestOwnershipVerified: true,
    signedShippingVerified: {
      verified: true,
      orderId: id,
      shippingAmountCents: 639
    },
    invoiceAssociationsClear: true,
    paymentHistoryClear: true
  };
}

test("passing preflight never authorizes writes or Square", () => {
  const result = assess(validInput());
  assert.equal(result.ready, true);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

const scenarios = [
  ["wrong database", input => {
    input.sandboxDatabase = "signavi_store";
  }],
  ["unverified guest", input => {
    input.guestOwnershipVerified = false;
  }],
  ["unverified shipping", input => {
    input.signedShippingVerified.verified = false;
  }],
  ["shipping order mismatch", input => {
    input.signedShippingVerified.orderId =
      "507f1f77bcf86cd799439012";
  }],
  ["invalid shipping amount", input => {
    input.signedShippingVerified.shippingAmountCents = 5000;
  }],
  ["invoice association uncertainty", input => {
    input.invoiceAssociationsClear = false;
  }],
  ["payment history uncertainty", input => {
    input.paymentHistoryClear = false;
  }],
  ["existing isolated operation", input => {
    input.sandboxOperation = { orderId: id };
  }],
  ["claimed payment creation", input => {
    input.storefrontOperation.squareCreationAttemptClaimedAt =
      new Date();
  }]
];

for (const [label, change] of scenarios) {
  test(`${label} blocks initialization readiness`, () => {
    const input = validInput();
    change(input);

    const result = assess(input);

    assert.equal(result.ready, false);
    assert.equal(result.initializationAuthorized, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });
}
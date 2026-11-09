import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";

function readers() {
  const bind = fields => async ({ orderId: id }) => ({
    orderId: id,
    environment: "sandbox",
    ...fields
  });

  return {
    orderId,
    readKnownHistory: bind({ knownRecordsClear: true }),
    readPaymentLinks: bind({ complete: true }),
    readSquareOrders: bind({ complete: true }),
    readSquarePayments: bind({ complete: true }),
    readOwnership: bind({
      exclusive: true,
      durable: true
    })
  };
}

test("complete mock evidence cannot authorize Square", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    readers()
  );

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
});

test("missing reader blocks evaluation", async () => {
  const input = readers();
  delete input.readSquarePayments;

  const result = await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.reason, "TRUSTED_READER_MISSING");
});

test("reader exception fails closed", async () => {
  const input = readers();

  input.readSquarePayments = async () => {
    throw new Error("Simulated Square timeout");
  };

  const result = await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.reason, "EVIDENCE_READER_FAILED");
  assert.equal(result.squareRequestAuthorized, false);
});

test("mismatched order identity fails closed", async () => {
  const input = readers();

  input.readPaymentLinks = async () => ({
    orderId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    environment: "sandbox",
    complete: true
  });

  const result = await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.reason, "EVIDENCE_IDENTITY_MISMATCH");
});

test("wrong Square environment fails closed", async () => {
  const input = readers();

  input.readSquarePayments = async () => ({
    orderId,
    environment: "production",
    complete: true
  });

  const result = await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.reason, "EVIDENCE_IDENTITY_MISMATCH");
});

test("existing Square activity prevents review", async () => {
  const input = readers();

  input.readSquarePayments = async () => ({
    orderId,
    environment: "sandbox",
    complete: true,
    existingPayment: true
  });

  const result = await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("invalid reader response fails closed", async () => {
  const input = readers();
  input.readSquareOrders = async () => null;

  const result = await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.reason, "EVIDENCE_RESPONSE_INVALID");
});
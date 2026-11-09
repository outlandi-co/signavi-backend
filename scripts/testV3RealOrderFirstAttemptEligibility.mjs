import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Order from "../models/Order.js";

import {
  evaluateV3FirstAttemptEligibility
} from "../utils/evaluateV3FirstAttemptEligibility.js";

const createOrder = overrides => {
  const now = new Date();

  const order = new Order({
    _id: new mongoose.Types.ObjectId(),
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    v3FirstAttemptProvenanceVersion:
      "storefront-v3-origin-v1",
    v3FirstAttemptProvenanceIssuedAt: now,
    squareEnvironment: null,
    squareExpectedAmountCents: null,
    squarePaymentId: "",
    squareOrderId: "",
    squarePaymentLinkId: "",
    paymentUrl: "",
    ...overrides
  });

  // Simulate the timestamp Mongoose supplies on insertion.
  // No MongoDB connection or save operation is performed.
  const document = order.toObject();
  document.createdAt ??= now;

  return document;
};

test("real Order schema accepts a new first-attempt candidate", () => {
  const order = createOrder();

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.eligible, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("historical order without provenance is rejected", () => {
  const order = createOrder({
    v3FirstAttemptProvenanceVersion: undefined,
    v3FirstAttemptProvenanceIssuedAt: undefined
  });

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("late provenance timestamp is rejected", () => {
  const order = createOrder({
    v3FirstAttemptProvenanceIssuedAt:
      new Date("2020-01-01T00:00:00.000Z")
  });

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.eligible, false);
  assert.equal(
    result.reason,
    "PROVENANCE_CREATION_TIME_MISMATCH"
  );
});

test("existing Square payment identity is rejected", () => {
  const order = createOrder({
    squarePaymentLinkId: "prior-square-link"
  });

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("paid real Order cannot start a first attempt", () => {
  const order = createOrder({
    paymentStatus: "paid"
  });

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.eligible, false);
});

test("an invoice order cannot use storefront provenance", () => {
  const order = createOrder({
    source: "invoice"
  });

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.eligible, false);
});

test("real Order schema prevents direct Square authorization", () => {
  const order = createOrder();

  const result = evaluateV3FirstAttemptEligibility({
    order
  });

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});
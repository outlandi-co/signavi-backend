import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateV3FirstAttemptEligibility
} from "../utils/evaluateV3FirstAttemptEligibility.js";

const createdAt = "2026-11-05T18:00:00.000Z";

const order = () => ({
  _id: "abcdef123456abcdef123456",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  createdAt,
  v3FirstAttemptProvenanceVersion: "storefront-v3-origin-v1",
  v3FirstAttemptProvenanceIssuedAt: createdAt,
  squareEnvironment: null,
  squareExpectedAmountCents: null,
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: "",
  paymentUrl: ""
});

const check = (overrides = {}) => {
  const { orderOverrides = {} } = overrides;

  return evaluateV3FirstAttemptEligibility({
    order: { ...order(), ...orderOverrides }
  });
};

test("new candidate never directly authorizes Square", () => {
  const result = check();

  assert.equal(result.eligible, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("missing provenance is blocked", () => {
  const result = check({
    orderOverrides: {
      v3FirstAttemptProvenanceVersion: undefined
    }
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "SERVER_PROVENANCE_NOT_ESTABLISHED");
});

test("provenance added later is blocked", () => {
  const result = check({
    orderOverrides: {
      v3FirstAttemptProvenanceIssuedAt: "2026-11-06T18:00:00.000Z"
    }
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PROVENANCE_CREATION_TIME_MISMATCH");
});

test("existing Square identity is blocked", () => {
  const result = check({
    orderOverrides: { squarePaymentLinkId: "existing_link" }
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "EXISTING_SQUARE_PAYMENT_IDENTITY");
});

test("paid orders are blocked", () => {
  const result = check({
    orderOverrides: { paymentStatus: "paid" }
  });

  assert.equal(result.eligible, false);
});

test("non-storefront orders are blocked", () => {
  const result = check({
    orderOverrides: { source: "invoice" }
  });

  assert.equal(result.eligible, false);
});

test("invalid identity is blocked", () => {
  const result = check({
    orderOverrides: { _id: "invalid" }
  });

  assert.equal(result.eligible, false);
});

test("missing source order is blocked", () => {
  const result = evaluateV3FirstAttemptEligibility();

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("caller-supplied provenance cannot authorize an old order", () => {
  const historicalOrder = order();
  delete historicalOrder.v3FirstAttemptProvenanceVersion;
  delete historicalOrder.v3FirstAttemptProvenanceIssuedAt;

  const result = evaluateV3FirstAttemptEligibility({
    order: historicalOrder,
    provenanceVersion: "storefront-v3-origin-v1",
    provenanceIssuedAt: createdAt
  });

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

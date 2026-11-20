import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyHistoricalOrderOwnership
} from "./classifyHistoricalOrderOwnership.mjs";

const id = "507f1f77bcf86cd799439011";

const order = {
  _id: id,
  storefront: "signavi_store",
  source: "store",
  orderType: "store",
  v3FirstAttemptProvenanceVersion: "storefront-v3-origin-v1",
  storefrontCreationFingerprint: "a".repeat(64)
};

function evidence(storefront, source = "creation_event") {
  return { orderId: id, storefront, source };
}

function assertBlocked(outcome) {
  assert.equal(outcome.ownershipVerified, false);
  assert.equal(outcome.migrationAuthorized, false);
  assert.equal(outcome.squareRequestAuthorized, false);
  assert.equal(outcome.retryAuthorized, false);
}

test("Defaults and V3 provenance alone remain unclassified", () => {
  const outcome = classifyHistoricalOrderOwnership({ order });

  assert.equal(outcome.classification, "unclassified");
  assertBlocked(outcome);
});

test("Store evidence produces only a review candidate", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order,
    evidence: [evidence("signavi_store")]
  });

  assert.equal(outcome.classification, "store_candidate");
  assertBlocked(outcome);
});

test("Studio evidence produces only a review candidate", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order,
    evidence: [evidence("signavi_studio")]
  });

  assert.equal(outcome.classification, "studio_candidate");
  assertBlocked(outcome);
});

test("Conflicting sources block automatic classification", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order,
    evidence: [
      evidence("signavi_store"),
      evidence("signavi_studio", "payment_operation")
    ]
  });

  assert.equal(outcome.classification, "conflicting");
  assertBlocked(outcome);
});

test("Evidence for a different order is rejected", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order,
    evidence: [{
      ...evidence("signavi_store"),
      orderId: "507f1f77bcf86cd799439012"
    }]
  });

  assert.equal(outcome.classification, "unclassified");
  assertBlocked(outcome);
});

test("Unknown evidence sources cannot establish a candidate", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order,
    evidence: [{
      ...evidence("signavi_store"),
      source: "schema_default"
    }]
  });

  assert.equal(outcome.classification, "unclassified");
  assertBlocked(outcome);
});

test("Invalid order ID fails closed", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order: { _id: "invalid", storefront: "signavi_store" },
    evidence: [evidence("signavi_store")]
  });

  assert.equal(outcome.classification, "unclassified");
  assertBlocked(outcome);
});

test("Malformed evidence fails closed", () => {
  const outcome = classifyHistoricalOrderOwnership({
    order,
    evidence: null
  });

  assert.equal(outcome.classification, "unclassified");
  assertBlocked(outcome);
});

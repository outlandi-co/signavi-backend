import test from "node:test";
import assert from "node:assert/strict";
import {
  planShippingProfileProvisioningReview as plan
} from "./planShippingProfileProvisioningReview.mjs";

const preflight = (ready, reason) => ({
  ready,
  reason,
  writesAuthorized: false
});

const run = (evidence, duplicateCount) => plan({
  expectedDatabase: "signavi_store",
  preflight: evidence,
  duplicateCount
});

test("missing collection produces review-only specification", () => {
  const value = run(preflight(false, "PROFILE_COLLECTION_MISSING"));
  assert.equal(value.action, "review");
  assert.equal(value.specification.database, "signavi_store");
  assert.equal(value.specification.proposedIndex.unique, true);
  assert.equal(value.mayCreateCollection, false);
});

test("verified collection and index need no migration", () => {
  const value = run(
    preflight(true, "PROFILE_COLLECTION_AND_INDEX_VERIFIED")
  );
  assert.equal(value.action, "none");
  assert.equal(value.mayCreateIndex, false);
});

test("missing index requires duplicate audit", () => {
  const value = run(
    preflight(false, "SHIPPING_PROFILE_UNIQUE_INDEX_MISSING")
  );
  assert.equal(value.action, "stop");
  assert.equal(value.reason, "DUPLICATE_AUDIT_REQUIRED");
});

test("duplicate product-package pairs block review", () => {
  const value = run(
    preflight(false, "SHIPPING_PROFILE_UNIQUE_INDEX_MISSING"),
    2
  );
  assert.equal(value.action, "stop");
});

test("zero audited duplicates permits review only", () => {
  const value = run(
    preflight(false, "SHIPPING_PROFILE_UNIQUE_INDEX_MISSING"),
    0
  );
  assert.equal(value.action, "review");
  assert.equal(value.mayCreateIndex, false);
});

test("Studio cannot be substituted for legacy database", () => {
  const value = plan({
    expectedDatabase: "signavi_studio",
    preflight: preflight(false, "PROFILE_COLLECTION_MISSING")
  });
  assert.equal(value.action, "stop");
});

test("invalid preflight evidence is rejected", () => {
  const value = run({
    ready: true,
    reason: "PROFILE_COLLECTION_AND_INDEX_VERIFIED",
    writesAuthorized: true
  });
  assert.equal(value.action, "stop");
});

test("every plan forbids execution and activation", () => {
  const scenarios = [
    run(preflight(false, "PROFILE_COLLECTION_MISSING")),
    run(preflight(false, "SHIPPING_PROFILE_UNIQUE_INDEX_MISSING"), 0),
    run(preflight(true, "PROFILE_COLLECTION_AND_INDEX_VERIFIED"))
  ];

  for (const value of scenarios) {
    assert.equal(value.mayCreateCollection, false);
    assert.equal(value.mayCreateIndex, false);
    assert.equal(value.mayCreateProfile, false);
    assert.equal(value.mayActivateProfile, false);
    assert.equal(value.mayExecutePayment, false);
  }
});
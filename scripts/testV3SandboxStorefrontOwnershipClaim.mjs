import test from "node:test";
import assert from "node:assert/strict";

import Order from "../models/Order.js";

import {
  buildV3SandboxStorefrontOwnershipClaim
} from "../utils/buildV3SandboxStorefrontOwnershipClaim.js";

const base = {
  orderId: "6aec6ff81538ade490af0a5b",
  amountCents: 4722,
  expectedRevision: 0,
  owner: "checkout:test-owner-001"
};

test("claim uses actual Order schema fields", () => {
  const claim = buildV3SandboxStorefrontOwnershipClaim(base);

  for (const field of Object.keys(claim.filter)) {
    if (field !== "_id") {
      assert.ok(Order.schema.path(field), field);
    }
  }

  assert.ok(
    Order.schema.path("v3SandboxInitializationRevision")
  );
});

test("claim requires unpaid sandbox payment state", () => {
  const claim = buildV3SandboxStorefrontOwnershipClaim(base);

  assert.equal(claim.filter.paymentStatus, "unpaid");
  assert.equal(claim.filter.squareEnvironment, "sandbox");
  assert.equal(claim.filter.status, "payment_required");
  assert.equal(claim.filter.squareExpectedAmountCents, 4722);
});

test("claim requires an unowned matching revision", () => {
  const claim = buildV3SandboxStorefrontOwnershipClaim(base);

  assert.equal(claim.filter.v3SandboxInitializationOwner, "");
  assert.equal(claim.filter.v3SandboxInitializationRevision, 0);
  assert.equal(
    claim.update.$set.v3SandboxInitializationOwner,
    base.owner
  );
  assert.equal(
    claim.update.$inc.v3SandboxInitializationRevision,
    1
  );
});

test("claim rejects existing payment identity in its conditions", () => {
  const claim = buildV3SandboxStorefrontOwnershipClaim(base);

  for (const field of [
    "squarePaymentId",
    "squarePaymentLinkId",
    "squareOrderId",
    "paymentUrl"
  ]) {
    assert.deepEqual(claim.filter[field], {
      $in: ["", null]
    });
  }

  assert.equal(claim.filter.paidAt, null);
});

test("claim never authorizes payment execution", () => {
  const claim = buildV3SandboxStorefrontOwnershipClaim(base);

  assert.equal(claim.initializationAuthorized, false);
  assert.equal(claim.squareRequestAuthorized, false);
  assert.equal(claim.retryAuthorized, false);
});

const invalidCases = [
  [{ ...base, orderId: "invalid" }, "V3_CLAIM_INVALID_ORDER_ID"],
  [{ ...base, amountCents: 0 }, "V3_CLAIM_INVALID_AMOUNT"],
  [{ ...base, amountCents: 47.22 }, "V3_CLAIM_INVALID_AMOUNT"],
  [{ ...base, expectedRevision: -1 }, "V3_CLAIM_INVALID_REVISION"],
  [{ ...base, owner: "" }, "V3_CLAIM_INVALID_OWNER"]
];

for (const [input, reason] of invalidCases) {
  test("invalid input fails closed: " + reason, () => {
    assert.throws(
      () => buildV3SandboxStorefrontOwnershipClaim(input),
      error => error.message === reason
    );
  });
}
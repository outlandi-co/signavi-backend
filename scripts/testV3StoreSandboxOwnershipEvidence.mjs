import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3StoreSandboxOwnershipEvidence as assess,
  collectV3StoreSandboxOwnershipEvidenceReadOnly as collect
} from "../utils/collectV3StoreSandboxOwnershipEvidenceReadOnly.js";

const id = "507f1f77bcf86cd799439011";

const candidate = () => ({
  orderId: id,
  storefrontOrder: {
    _id: id,
    squareExpectedAmountCents: 2500
  },
  prepared: {
    orderId: id,
    totalCents: 2500
  },
  lock: {
    _id: id,
    owner: "server-generated-lock-owner",
    expiresAt: new Date("2030-01-01T00:00:00Z")
  },
  now: new Date("2026-11-14T00:00:00Z")
});

test("consistent Store and lock qualify only for review", () => {
  const result = assess(candidate());

  assert.equal(result.eligibleForTrustedReview, true);
  assert.equal(result.expectedAmountCents, 2500);
  assert.equal(result.expectedOwner, "server-generated-lock-owner");
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("mismatched Store order fails closed", () => {
  const input = candidate();
  input.storefrontOrder._id = "507f191e810c19729de860ea";

  assert.equal(
    assess(input).reason,
    "STOREFRONT_ORDER_MISMATCH"
  );
});

test("incorrect signed checkout amount fails closed", () => {
  const input = candidate();
  input.prepared.totalCents = 2600;

  assert.equal(
    assess(input).reason,
    "VERIFIED_CHECKOUT_AMOUNT_MISMATCH"
  );
});

test("incorrect lock order fails closed", () => {
  const input = candidate();
  input.lock._id = "507f191e810c19729de860ea";

  assert.equal(
    assess(input).reason,
    "ACTIVE_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("missing lock owner fails closed", () => {
  const input = candidate();
  input.lock.owner = "";

  assert.equal(
    assess(input).reason,
    "ACTIVE_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("expired lock fails closed", () => {
  const input = candidate();
  input.lock.expiresAt = new Date("2020-01-01T00:00:00Z");

  assert.equal(
    assess(input).reason,
    "ACTIVE_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("caller approval does not authorize payment", () => {
  const input = candidate();
  input.squareRequestAuthorized = true;
  input.authorized = true;

  const result = assess(input);

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("server coordinator denies missing credentials", async () => {
  const result = await collect({
    orderId: id,
    guestToken: "",
    signedQuote: ""
  });

  assert.equal(result.eligibleForTrustedReview, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("invalid order ID fails closed", () => {
  const input = candidate();
  input.orderId = "invalid";

  assert.equal(assess(input).reason, "INVALID_ORDER_ID");
});

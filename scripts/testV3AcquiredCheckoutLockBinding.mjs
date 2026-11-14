import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3AcquiredCheckoutLockBinding as assess
} from "../utils/collectV3StoreSandboxOwnershipEvidenceReadOnly.js";

const id = "507f1f77bcf86cd799439011";
const expiry = new Date("2030-01-01T00:00:00Z");
const now = new Date("2026-11-14T00:00:00Z");

function candidate() {
  return {
    orderId: id,
    now,
    acquiredLock: {
      orderId: id,
      owner: "server-generated-attempt-a",
      expiresAt: new Date(expiry)
    },
    persistedLock: {
      _id: id,
      owner: "server-generated-attempt-a",
      expiresAt: new Date(expiry)
    }
  };
}

test("matching active attempt qualifies for review only", () => {
  const result = assess(candidate());
  assert.equal(result.bound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("different checkout owner is rejected", () => {
  const input = candidate();
  input.persistedLock.owner = "different-attempt";

  assert.equal(
    assess(input).reason,
    "CHECKOUT_LOCK_ATTEMPT_MISMATCH"
  );
});

test("different lock expiration is rejected", () => {
  const input = candidate();
  input.persistedLock.expiresAt =
    new Date("2030-01-02T00:00:00Z");

  assert.equal(
    assess(input).reason,
    "CHECKOUT_LOCK_ATTEMPT_MISMATCH"
  );
});

test("missing acquired lock is rejected", () => {
  const input = candidate();
  input.acquiredLock = null;

  assert.equal(
    assess(input).reason,
    "CURRENT_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("missing persisted lock is rejected", () => {
  const input = candidate();
  input.persistedLock = null;

  assert.equal(
    assess(input).reason,
    "CURRENT_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("expired lock is rejected", () => {
  const input = candidate();
  input.acquiredLock.expiresAt =
    new Date("2020-01-01T00:00:00Z");

  assert.equal(
    assess(input).reason,
    "CURRENT_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("wrong persisted order is rejected", () => {
  const input = candidate();
  input.persistedLock._id = "507f191e810c19729de860ea";

  assert.equal(
    assess(input).reason,
    "CURRENT_CHECKOUT_LOCK_NOT_VERIFIED"
  );
});

test("caller approval cannot create authorization", () => {
  const input = candidate();
  input.squareRequestAuthorized = true;
  input.acquiredLock.authorized = true;

  assert.equal(assess(input).squareRequestAuthorized, false);
});

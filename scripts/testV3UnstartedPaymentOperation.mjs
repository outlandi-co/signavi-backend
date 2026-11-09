import test from "node:test";
import assert from "node:assert/strict";

import {
  isV3UnstartedPaymentOperation
} from "../utils/isV3UnstartedPaymentOperation.js";

const pristine = () => ({
  environment: "sandbox",
  status: "pending",
  requestOwner: "",
  squareCreationAttemptClaimedAt: null,
  squareIdempotencyKey: null,
  squarePaymentId: "",
  squarePaymentLinkId: "",
  squareOrderId: "",
  paymentUrl: "",
  squareDiagnostic: null,
  lastError: ""
});

test("pristine pending operation is unstarted", () => {
  assert.equal(
    isV3UnstartedPaymentOperation(pristine()),
    true
  );
});

for (const [field, value] of [
  ["squareCreationAttemptClaimedAt", new Date()],
  ["squareIdempotencyKey", "previous-request"],
  ["squarePaymentId", "payment-id"],
  ["squarePaymentLinkId", "link-id"],
  ["squareOrderId", "square-order"],
  ["paymentUrl", "https://example.invalid"],
  ["squareDiagnostic", { code: "UNCERTAIN" }],
  ["lastError", "previous-attempt"],
  ["requestOwner", "other-owner"]
]) {
  test(`${field} blocks unstarted release`, () => {
    const operation = pristine();
    operation[field] = value;

    assert.equal(
      isV3UnstartedPaymentOperation(operation),
      false
    );
  });
}

test("nonpending operation is blocked", () => {
  const operation = pristine();
  operation.status = "reconciliation_required";

  assert.equal(
    isV3UnstartedPaymentOperation(operation),
    false
  );
});

test("missing operation is blocked", () => {
  assert.equal(
    isV3UnstartedPaymentOperation(null),
    false
  );
});
import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SandboxRecordedLink
} from "../utils/inspectV3SandboxRecordedLink.js";

const orderId = "507f1f77bcf86cd799439011";

const createFixture = () => ({
  order: {
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 5528
  },

  operation: {
    _id: "507f191e810c19729de860ea",
    orderId,
    environment: "sandbox",
    status: "completed",
    amountCents: 5528,
    requestOwner: "verified-test-owner",
    checkoutReferenceId: `signavi-v3-${orderId}`,
    idempotencyKey:
      "signavi-v3-sandbox-550e8400-e29b-41d4-a716-446655440000",
    squareCreationAttemptClaimedAt:
      new Date("2026-11-01T12:00:00Z"),
    squarePaymentLinkId: "mock-link-123",
    squareOrderId: "mock-square-order-123",
    paymentUrl: "https://square.link/u/mock-link"
  },

  ownership: {
    environment: "sandbox",
    purchaseKey: `order:${orderId}`,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId
  }
});

test("completed recorded link is an eligible candidate only", () => {
  const result = inspectV3SandboxRecordedLink(
    createFixture()
  );

  assert.equal(result.eligible, true);
  assert.equal(result.reason, "RECORDED_LINK_CANDIDATE");
  assert.equal(result.orderId, orderId);
  assert.equal(result.httpReleaseAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);

  assert.equal(
    Object.hasOwn(result, "paymentUrl"),
    false
  );

  assert.ok(Object.isFrozen(result));
});

const negativeCases = [
  ["missing Store order", data => {
    data.order = null;
  }, "MISSING_RECORDS"],

  ["incorrect Store channel", data => {
    data.order.source = "studio";
  }, "OWNERSHIP_MISMATCH"],

  ["different payment order", data => {
    data.operation.orderId = "507f1f77bcf86cd799439012";
  }, "OWNERSHIP_MISMATCH"],

  ["incorrect purchase ownership", data => {
    data.ownership.purchaseKey = "order:another";
  }, "OWNERSHIP_MISMATCH"],

  ["different payment amount", data => {
    data.operation.amountCents = 9999;
  }, "PAYMENT_BINDING_MISMATCH"],

  ["production environment", data => {
    data.operation.environment = "production";
  }, "PAYMENT_BINDING_MISMATCH"],

  ["already paid order", data => {
    data.order.paymentStatus = "paid";
  }, "ORDER_NOT_PAYABLE"],

  ["legacy checkout reference", data => {
    data.operation.checkoutReferenceId =
      `signavi-v3-sandbox-${orderId}`;
  }, "PAYMENT_IDENTITY_MISMATCH"],

  ["invalid idempotency key", data => {
    data.operation.idempotencyKey = "invalid";
  }, "PAYMENT_IDENTITY_MISMATCH"],

  ["pending operation", data => {
    data.operation.status = "pending";
  }, "LINK_NOT_DURABLY_RECORDED"],

  ["reconciliation required", data => {
    data.operation.status = "reconciliation_required";
  }, "LINK_NOT_DURABLY_RECORDED"],

  ["missing creation claim", data => {
    data.operation.squareCreationAttemptClaimedAt = null;
  }, "LINK_NOT_DURABLY_RECORDED"],

  ["missing Square link ID", data => {
    data.operation.squarePaymentLinkId = "";
  }, "LINK_NOT_DURABLY_RECORDED"],

  ["missing Square order ID", data => {
    data.operation.squareOrderId = "";
  }, "LINK_NOT_DURABLY_RECORDED"],

  ["invalid URL", data => {
    data.operation.paymentUrl = "not-a-url";
  }, "INVALID_PAYMENT_URL"],

  ["HTTP link", data => {
    data.operation.paymentUrl =
      "http://square.link/u/mock-link";
  }, "UNTRUSTED_PAYMENT_URL"],

  ["spoofed Square domain", data => {
    data.operation.paymentUrl =
      "https://square.link.evil.example/u/mock";
  }, "UNTRUSTED_PAYMENT_URL"],

  ["URL with credentials", data => {
    data.operation.paymentUrl =
      "https://user:pass@square.link/u/mock";
  }, "UNTRUSTED_PAYMENT_URL"],

  ["unapproved hostname", data => {
    data.operation.paymentUrl =
      "https://example.com/pay";
  }, "UNTRUSTED_PAYMENT_URL"],

  ["Square root URL", data => {
    data.operation.paymentUrl =
      "https://square.link/";
  }, "UNTRUSTED_PAYMENT_URL"]
];

for (const [name, mutate, expectedReason] of negativeCases) {
  test(`rejects ${name}`, () => {
    const fixture = createFixture();
    mutate(fixture);

    const result = inspectV3SandboxRecordedLink(
      fixture
    );

    assert.equal(result.eligible, false);
    assert.equal(result.reason, expectedReason);
    assert.equal(result.httpReleaseAuthorized, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(Object.hasOwn(result, "paymentUrl"), false);
  });
}

console.log(
  "HTTP PAYMENT RELEASE REMAINS DISABLED"
);
console.log(
  "NO SQUARE REQUESTS OR DATABASE CONNECTIONS"
);
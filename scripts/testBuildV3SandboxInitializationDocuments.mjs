import test from "node:test";
import assert from "node:assert/strict";

import {
  buildV3SandboxInitializationDocuments
} from "../utils/buildV3SandboxInitializationDocuments.js";

const id = "6aec6ff81538ade490af0a5b";

function fixture() {
  return {
    storefrontOrder: {
      _id: id,
      customerName: "Sandbox Test Customer",
      email: "sandbox-test@example.invalid",
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      currency: "USD",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 4722,
      items: [
        { name: "Test item", quantity: 1 }
      ],
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      paidAt: null
    },
    storefrontOperation: {
      orderId: id,
      status: "pending",
      environment: "sandbox",
      requestOwner: "",
      amountCents: 4722,
      idempotencyKey:
        "signavi-v3-sandbox-00000000-0000-4000-8000-000000000001",
      checkoutReferenceId: `signavi-v3-${id}`,
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      squareDiagnostic: null,
      lastError: ""
    }
  };
}

test("preserves payment identity and amount", () => {
  const input = fixture();

  const result = buildV3SandboxInitializationDocuments(input);

  assert.equal(result.eligible, true);
  assert.equal(result.amountCents, 4722);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);

  assert.equal(
    result.operationDocument.idempotencyKey,
    input.storefrontOperation.idempotencyKey
  );

  assert.equal(
    result.operationDocument.checkoutReferenceId,
    input.storefrontOperation.checkoutReferenceId
  );

  assert.equal(result.orderDocument._id, id);
  assert.equal(result.operationDocument.orderId, id);
});

test("creates independent copies without changing storefront data", () => {
  const input = fixture();

  const result = buildV3SandboxInitializationDocuments(input);

  assert.equal(result.eligible, true);

  assert.notStrictEqual(
    result.orderDocument,
    input.storefrontOrder
  );

  assert.notStrictEqual(
    result.operationDocument,
    input.storefrontOperation
  );

  result.orderDocument.items[0].name = "Changed test item";

  assert.equal(
    input.storefrontOrder.items[0].name,
    "Test item"
  );
});

test("blocks an existing isolated payment operation", () => {
  const input = fixture();

  const result = buildV3SandboxInitializationDocuments({
    ...input,
    sandboxOperation: { orderId: id }
  });

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("blocks an already claimed Square creation attempt", () => {
  const input = fixture();

  input.storefrontOperation.squareCreationAttemptClaimedAt =
    new Date();

  const result = buildV3SandboxInitializationDocuments(input);

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("blocks missing required customer information", () => {
  const input = fixture();

  input.storefrontOrder.email = "";

  const result = buildV3SandboxInitializationDocuments(input);

  assert.equal(result.eligible, false);
  assert.equal(
    result.reason,
    "SANDBOX_DOCUMENT_BINDING_INVALID"
  );
});

test("blocks an already paid order", () => {
  const input = fixture();

  input.storefrontOrder.paymentStatus = "paid";

  const result = buildV3SandboxInitializationDocuments(input);

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});
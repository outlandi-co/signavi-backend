import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

import {
  createV3SandboxPaymentEvidenceReader
} from "../utils/createV3SandboxPaymentEvidenceReader.js";

import {
  createV3SandboxOrderHistoryReader
} from "../utils/createV3SandboxOrderHistoryReader.js";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";

function buildInput({
  links = [],
  payments = [],
  orders = [],
  orderSearchFails = false,
  paymentReadFails = false
} = {}) {
  const bind = fields => async ({ orderId: id }) => ({
    orderId: id,
    environment: "sandbox",
    ...fields
  });

  return {
    orderId,

    // MongoDB readers are not yet connected.
    readKnownHistory: bind({ knownRecordsClear: true }),

    readOwnership: bind({
      exclusive: true,
      durable: true
    }),

    readPaymentLinks: createV3SandboxLinkEvidenceReader({
      historyReader: {
        collectHistory: async () => ({
          complete: true,
          links
        })
      },
      ordersClient: {
        get: async ({ orderId: id }) => ({
          order: { id, note: "" }
        })
      }
    }),

    readSquareOrders: createV3SandboxOrderHistoryReader({
      testClient: {
        orders: {
          search: async () => {
            if (orderSearchFails) {
              throw new Error("Simulated order search failure");
            }
            return { orders };
          }
        }
      }
    }),

    readSquarePayments: createV3SandboxPaymentEvidenceReader({
      testClient: {
        payments: {
          list: async () => {
            if (paymentReadFails) {
              throw new Error("Simulated payment read failure");
            }
            return {
              response: { payments }
            };
          }
        }
      }
    })
  };
}

test("three empty histories permit review, never creation", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput()
  );

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("existing open Square order blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      orders: [{
        id: "square_open_order",
        state: "OPEN",
        referenceId: `signavi-v3-sandbox-${orderId}`
      }]
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  assert.equal(result.squareRequestAuthorized, false);
});

test("existing completed Square payment blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      payments: [{
        id: "square_completed_payment",
        status: "COMPLETED",
        referenceId: `ID:${orderId}`
      }]
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
});

test("Square order-search failure blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      orderSearchFails: true
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("Square payment-read failure blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      paymentReadFails: true
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("unidentified Square order blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      orders: [{ id: "unidentified_square_order" }]
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});
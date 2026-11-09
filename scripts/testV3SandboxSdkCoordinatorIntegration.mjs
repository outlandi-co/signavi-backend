import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxPaymentEvidenceReader
} from "../utils/createV3SandboxPaymentEvidenceReader.js";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";

function buildInput({ paymentList, links = [] } = {}) {
  const bind = fields => async ({ orderId: id }) => ({
    orderId: id,
    environment: "sandbox",
    ...fields
  });

  const readSquarePayments =
    createV3SandboxPaymentEvidenceReader({
      testClient: {
        payments: {
          list: paymentList ?? (async () => ({
            response: { payments: [] }
          }))
        }
      }
    });

  return {
    orderId,

    readKnownHistory: bind({
      knownRecordsClear: true
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

    // Still mocked; not yet authoritative.
    readSquareOrders: bind({ complete: true }),

    readSquarePayments,

    // Still mocked; not yet authoritative.
    readOwnership: bind({
      exclusive: true,
      durable: true
    })
  };
}

test("SDK evidence reaches coordinator without authorization", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput()
  );

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("SDK previous payment blocks coordinator review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      paymentList: async () => ({
        response: {
          payments: [{
            id: "existing_payment",
            referenceId: `ID:${orderId}`
          }]
        }
      })
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  assert.equal(result.squareRequestAuthorized, false);
});

test("SDK error blocks coordinator review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      paymentList: async () => {
        throw new Error("Simulated Square API outage");
      }
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("unidentified SDK payment blocks coordinator review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      paymentList: async () => ({
        response: {
          payments: [{ id: "unknown_payment" }]
        }
      })
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});
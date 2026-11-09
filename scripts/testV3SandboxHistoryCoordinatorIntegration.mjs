import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";

function buildInput({
  history,
  getOrder = async () => {
    throw new Error("Unexpected Square order request");
  }
}) {
  const bind = fields => async ({ orderId: id }) => ({
    orderId: id,
    environment: "sandbox",
    ...fields
  });

  return {
    orderId,
    readKnownHistory: bind({ knownRecordsClear: true }),
    readPaymentLinks: createV3SandboxLinkEvidenceReader({
      historyReader: {
        collectHistory: async () => history
      },
      ordersClient: {
        get: getOrder
      }
    }),
    readSquareOrders: bind({ complete: true }),
    readSquarePayments: bind({ complete: true }),
    readOwnership: bind({
      exclusive: true,
      durable: true
    })
  };
}

test("empty link history permits review only, never payment", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      history: {
        complete: true,
        links: []
      }
    })
  );

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("existing historical link blocks coordinator review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      history: {
        complete: true,
        links: [{
          id: "link_existing",
          orderId: "square_order_existing",
          paymentNote: `ID:${orderId}`,
          description: ""
        }]
      },
      getOrder: async () => ({
        order: {
          id: "square_order_existing",
          note: `ID:${orderId}`
        }
      })
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  assert.equal(result.squareRequestAuthorized, false);
});

test("incomplete link history blocks coordinator review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      history: {
        complete: false,
        links: []
      }
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("Square order lookup failure blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      history: {
        complete: true,
        links: [{
          id: "link_uncertain",
          orderId: "square_order_uncertain",
          paymentNote: "",
          description: ""
        }]
      },
      getOrder: async () => {
        throw new Error("Simulated lookup failure");
      }
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});
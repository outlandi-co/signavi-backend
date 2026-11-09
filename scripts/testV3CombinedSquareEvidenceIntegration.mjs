import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";

function buildInput({
  links = [],
  payments = [],
  linkComplete = true,
  paymentFailure = false
} = {}) {
  const bind = fields => async ({ orderId: id }) => ({
    orderId: id,
    environment: "sandbox",
    ...fields
  });

  return {
    orderId,

    readKnownHistory: bind({
      knownRecordsClear: true
    }),

    readPaymentLinks: createV3SandboxLinkEvidenceReader({
      historyReader: {
        collectHistory: async () => ({
          complete: linkComplete,
          links
        })
      },
      ordersClient: {
        get: async ({ orderId: id }) => ({
          order: {
            id,
            note: ""
          }
        })
      }
    }),

    readSquareOrders: bind({
      complete: true
    }),

    readSquarePayments: async ({ orderId: id }) =>
      collectV3SandboxPaymentRecordEvidence({
        orderId: id,
        listPage: async () => {
          if (paymentFailure) {
            throw new Error("Simulated Square failure");
          }

          return { payments };
        }
      }),

    readOwnership: bind({
      exclusive: true,
      durable: true
    })
  };
}

test("empty mock histories permit review but not creation", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput()
  );

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("prior Square payment blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      payments: [{
        id: "existing_payment",
        referenceId: `ID:${orderId}`
      }]
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  assert.equal(result.squareRequestAuthorized, false);
});

test("unknown Square payment blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      payments: [{
        id: "unknown_payment"
      }]
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("Square payment API failure blocks review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      paymentFailure: true
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("incomplete link history blocks combined review", async () => {
  const result = await collectV3FirstPaymentEvidenceReadOnly(
    buildInput({
      linkComplete: false
    })
  );

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});
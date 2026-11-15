import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

import {
  createV3SandboxLinkEvidenceReader
} from "../utils/createV3SandboxLinkEvidenceReader.js";

import {
  inspectV3FirstPaymentEvidenceContract
} from "../utils/inspectV3FirstPaymentEvidenceContract.js";

const orderId = "a".repeat(24);
const reference = `signavi-v3-sandbox-${orderId}`;

async function collectPositiveEvidence() {
  const squareOrders =
    await collectV3SandboxOrderRecordEvidence({
      orderId,
      listPage: async () => ({
        orders: [{
          id: "square-order-1",
          referenceId: reference
        }],
        cursor: null
      })
    });

  const squarePayments =
    await collectV3SandboxPaymentRecordEvidence({
      orderId,
      listPage: async () => ({
        payments: [{
          id: "square-payment-1",
          referenceId: reference
        }],
        cursor: null
      })
    });

  const readPaymentLinks =
    createV3SandboxLinkEvidenceReader({
      historyReader: {
        async collectHistory() {
          return {
            complete: true,
            links: [{
              id: "square-link-1",
              orderId: "square-order-1",
              description:
                `signavi-v3-production-purchase-${orderId}`
            }]
          };
        }
      },
      ordersClient: {
        async get() {
          throw new Error("SIMULATED_SQUARE_ORDER_FAILURE");
        }
      }
    });

  const paymentLinks = await readPaymentLinks({ orderId });

  return {
    squareOrders,
    squarePayments,
    paymentLinks
  };
}

test("three actual readers preserve distinct positive evidence", async () => {
  const evidence = await collectPositiveEvidence();

  assert.equal(evidence.squareOrders.existingOrder, true);
  assert.equal(evidence.squarePayments.existingPayment, true);
  assert.equal(evidence.paymentLinks.existingLink, true);

  assert.equal(evidence.squareOrders.priorActivityFound, true);
  assert.equal(evidence.squarePayments.priorActivityFound, true);
  assert.equal(evidence.paymentLinks.priorActivityFound, true);

  assert.equal(evidence.paymentLinks.complete, false);

  assert.equal(
    Object.hasOwn(evidence.squareOrders, "existingPayment"),
    false
  );
  assert.equal(
    Object.hasOwn(evidence.squareOrders, "existingLink"),
    false
  );
  assert.equal(
    Object.hasOwn(evidence.squarePayments, "existingLink"),
    false
  );
  assert.equal(
    Object.hasOwn(evidence.paymentLinks, "existingPayment"),
    false
  );
});

test("strict contract recognizes positive fields but remains unsafe", async () => {
  const evidence = await collectPositiveEvidence();

  const report = inspectV3FirstPaymentEvidenceContract({
    knownHistory: {
      complete: true,
      knownRecordsClear: false,
      authoritativeNoPriorActivity: false
    },
    ...evidence,
    ownership: {
      complete: true,
      exclusive: false,
      durable: false,
      authoritativeNoPriorActivity: false
    }
  });

  assert.equal(
    report.sources.paymentLinks.missingFields.includes(
      "existingLink"
    ),
    false
  );

  assert.equal(
    report.sources.squarePayments.missingFields.includes(
      "existingPayment"
    ),
    false
  );

  assert.equal(
    report.sources.squareOrders.missingFields.includes(
      "existingPayment"
    ),
    true
  );

  assert.ok(report.missingFieldCount > 0);
  assert.equal(report.readyForAuthorizationReview, false);
  assert.equal(report.squareRequestAuthorized, false);
  assert.equal(report.initializationAuthorized, false);
  assert.equal(report.retryAuthorized, false);
});

test("all observed readers remain unable to authorize payment", async () => {
  const evidence = await collectPositiveEvidence();

  for (const source of [
    evidence.paymentLinks,
    evidence.squareOrders,
    evidence.squarePayments
  ]) {
    assert.equal(source.authoritativeNoPriorActivity, false);
    assert.equal(source.squareRequestAuthorized, false);
    assert.equal(source.retryAuthorized, false);
  }
});

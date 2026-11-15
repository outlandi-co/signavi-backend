import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "0123456789abcdef01234567";

const linkEvidence = () => ({
  orderId,
  environment: "sandbox",
  complete: true,
  hasMore: false,
  timedOut: false,
  priorActivityFound: false,
  existingPayment: false,
  existingLink: false,
  conflicting: false,
  identityMismatch: false
});

function makeService({
  listOrders = async () => ({ orders: [], cursor: null }),
  listPayments = async () => ({ payments: [], cursor: null })
} = {}) {
  return createV3ServerBoundFirstPaymentReview({
    readKnownHistory: async () => ({
      orderId,
      environment: "sandbox",
      knownRecordsClear: true
    }),

    readPaymentLinks: async () => linkEvidence(),

    readSquareOrders: async ({ orderId: id }) =>
      collectV3SandboxOrderRecordEvidence({
        orderId: id,
        listPage: listOrders
      }),

    readSquarePayments: async ({ orderId: id }) =>
      collectV3SandboxPaymentRecordEvidence({
        orderId: id,
        listPage: listPayments
      }),

    readOwnership: async () => ({
      orderId,
      environment: "sandbox",
      exclusive: true,
      durable: true
    })
  });
}

function assertBlocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
}

test("real empty-history collector outputs remain blocked", async () => {
  const service = makeService();
  const result = await service.review(orderId);

  assertBlocked(result);
});

test("real prior order detection blocks coordinator", async () => {
  const service = makeService({
    listOrders: async () => ({
      orders: [{
        id: "existing-order",
        referenceId: `id:${orderId}`
      }],
      cursor: null
    })
  });

  const result = await service.review(orderId);
  assertBlocked(result);
});

test("real prior payment detection blocks coordinator", async () => {
  const service = makeService({
    listPayments: async () => ({
      payments: [{
        id: "existing-payment",
        referenceId: `id:${orderId}`
      }],
      cursor: null
    })
  });

  const result = await service.review(orderId);
  assertBlocked(result);
});

test("real Square reader failure blocks coordinator", async () => {
  const service = makeService({
    listPayments: async () => {
      throw new Error("Simulated Square outage");
    }
  });

  const result = await service.review(orderId);
  assertBlocked(result);
});

test("incomplete pagination blocks coordinator", async () => {
  const service = makeService({
    listOrders: async ({ cursor }) => ({
      orders: [],
      cursor: cursor === null ? "page-2" : "page-3"
    })
  });

  const result = await service.review(orderId);
  assertBlocked(result);
});
